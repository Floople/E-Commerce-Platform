import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import type { Purchase, CreditLedgerEntry } from "../types";

const CUSTOMER_ID = "customer-uuid-123";
const PRODUCT_1 = "product-uuid-1";
const PRODUCT_2 = "product-uuid-2";

let mockServerHandle: Server;
let internalServerHandle: Server;
let baseUrl: string;

// Check decimal precision (94.02 + 2.99 === 97.00999999999999)
function assertCloseTo(actual: number, expected: number, message: string): void {
    assert.ok(Math.abs(actual - expected) < 1e-6, `${message}: expected ~${expected}, got ${actual}`);
}

// Resets balance to what's needed in tests
async function setBalance(target: number): Promise<void> {
    const current = ((await (await fetch(`${baseUrl}/credits/${CUSTOMER_ID}/balance`)).json()) as { data: { balance: number } }).data.balance;
    if (current > 0) {
        await fetch(`${baseUrl}/credits/${CUSTOMER_ID}/deduct`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ amount: current }),
        });
    }
    if (target > 0) {
        await fetch(`${baseUrl}/credits/${CUSTOMER_ID}/grant`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ amount: target }),
        });
    }
}

before(async () => {
    // gotta start the mock API first so we know what port to tell our server's client to
    // hit, before it (or anything it pulls in) actually gets required
    const { server: mockApp } = await import("../externalApi/mockServer");
    mockServerHandle = mockApp.listen(0);
    await new Promise<void>(resolve => mockServerHandle.once("listening", resolve));
    process.env.EXTERNAL_API_URL = `http://localhost:${(mockServerHandle.address() as AddressInfo).port}`;

    const { server: internalApp } = await import("../server");
    internalServerHandle = internalApp.listen(0);
    await new Promise<void>(resolve => internalServerHandle.once("listening", resolve));
    baseUrl = `http://localhost:${(internalServerHandle.address() as AddressInfo).port}/v1`;
});

after(async () => {
    await new Promise(resolve => mockServerHandle.close(resolve));
    await new Promise(resolve => internalServerHandle.close(resolve));
});

test("purchasing a product deducts credit, and refunding it (partially then fully) restores it", async () => {
    let res = await fetch(`${baseUrl}/credits/${CUSTOMER_ID}/grant`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: 100 }),
    });
    assert.equal(res.status, 200);
    let entry = ((await res.json()) as { data: CreditLedgerEntry }).data;
    assert.equal(entry.balanceAfter, 100);

    res = await fetch(`${baseUrl}/purchases`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerId: CUSTOMER_ID, productId: PRODUCT_1, quantity: 2 }),
    });
    assert.equal(res.status, 200);
    const purchase = ((await res.json()) as { data: Purchase }).data;
    assert.equal(purchase.status, "COMPLETED");
    assert.equal(purchase.totalAmount, 5.98);
    assert.ok(purchase.shipmentId, "purchase should have a shipmentId from CreateShipment");

    res = await fetch(`${baseUrl}/credits/${CUSTOMER_ID}/balance`);
    assertCloseTo((await res.json()).data.balance, 94.02, "balance after purchase");

    // refund half of it first
    res = await fetch(`${baseUrl}/purchases/${purchase.id}/refund`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: 2.99 }),
    });
    assert.equal(res.status, 200);
    let updated = ((await res.json()) as { data: Purchase }).data;
    assert.equal(updated.status, "PARTIALLY_REFUNDED");
    assert.equal(updated.refundedAmount, 2.99);

    res = await fetch(`${baseUrl}/credits/${CUSTOMER_ID}/balance`);
    assertCloseTo((await res.json()).data.balance, 97.01, "balance after partial refund");

    // then refund whatever's left (no amount = just refund the rest)
    res = await fetch(`${baseUrl}/purchases/${purchase.id}/refund`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
    });
    assert.equal(res.status, 200);
    updated = ((await res.json()) as { data: Purchase }).data;
    assert.equal(updated.status, "REFUNDED");
    assert.equal(updated.refundedAmount, 5.98);

    res = await fetch(`${baseUrl}/credits/${CUSTOMER_ID}/balance`);
    assertCloseTo((await res.json()).data.balance, 100, "balance after full refund");

    res = await fetch(`${baseUrl}/purchases?customerId=${CUSTOMER_ID}`);
    const purchases = ((await res.json()) as { data: Purchase[] }).data;
    assert.ok(purchases.some(p => p.id === purchase.id));
});

test("a purchase is rejected (and never saved) when the customer has insufficient credit", async () => {
    let res = await fetch(`${baseUrl}/credits/${CUSTOMER_ID}/deduct`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: 99 }),
    });
    assert.equal(res.status, 200);

    const purchasesBefore = ((await (await fetch(`${baseUrl}/purchases?customerId=${CUSTOMER_ID}`)).json()) as { data: Purchase[] }).data;

    res = await fetch(`${baseUrl}/purchases`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerId: CUSTOMER_ID, productId: PRODUCT_2, quantity: 1 }),
    });
    assert.equal(res.status, 400);
    const body = (await res.json()) as { error: string };
    assert.match(body.error, /insufficient credit/i);

    res = await fetch(`${baseUrl}/credits/${CUSTOMER_ID}/balance`);
    assertCloseTo((await res.json()).data.balance, 1, "balance after failed purchase attempt");

    const purchasesAfter = ((await (await fetch(`${baseUrl}/purchases?customerId=${CUSTOMER_ID}`)).json()) as { data: Purchase[] }).data;
    assert.equal(purchasesAfter.length, purchasesBefore.length, "no new purchase should have been saved");
});

test("concurrent purchases for the same customer don't overdraw the balance", async () => {
    // set balance to exactly enough for one purchase of product 1, not two
    await setBalance(2.99);
    const purchasesBefore = ((await (await fetch(`${baseUrl}/purchases?customerId=${CUSTOMER_ID}`)).json()) as { data: Purchase[] }).data;

    // fire both at once to see if mutex works
    const buy = () =>
        fetch(`${baseUrl}/purchases`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ customerId: CUSTOMER_ID, productId: PRODUCT_1, quantity: 1 }),
        });
    const [resA, resB] = await Promise.all([buy(), buy()]);

    const statuses = [resA.status, resB.status].sort();
    assert.deepEqual(statuses, [200, 400], "exactly one purchase should go through, the other should get rejected");

    const balanceRes = await fetch(`${baseUrl}/credits/${CUSTOMER_ID}/balance`);
    assertCloseTo((await balanceRes.json()).data.balance, 0, "should land at exactly 0, never negative");

    const purchasesAfter = ((await (await fetch(`${baseUrl}/purchases?customerId=${CUSTOMER_ID}`)).json()) as { data: Purchase[] }).data;
    assert.equal(purchasesAfter.length, purchasesBefore.length + 1, "only one of the two should've actually been saved");
});

test("unknown customer or product 404s and doesn't touch credit or purchases", async () => {
    const balanceBefore = ((await (await fetch(`${baseUrl}/credits/${CUSTOMER_ID}/balance`)).json()) as { data: { balance: number } }).data.balance;
    const purchasesBefore = ((await (await fetch(`${baseUrl}/purchases?customerId=${CUSTOMER_ID}`)).json()) as { data: Purchase[] }).data;

    // check 404 with non existent customer id
    let res = await fetch(`${baseUrl}/purchases`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerId: "nonexistent-customer", productId: PRODUCT_1, quantity: 1 }),
    });
    assert.equal(res.status, 404);

    // same deal but with a product that doesn't exist
    res = await fetch(`${baseUrl}/purchases`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerId: CUSTOMER_ID, productId: "nonexistent-product", quantity: 1 }),
    });
    assert.equal(res.status, 404);

    const balanceAfter = ((await (await fetch(`${baseUrl}/credits/${CUSTOMER_ID}/balance`)).json()) as { data: { balance: number } }).data.balance;
    assertCloseTo(balanceAfter, balanceBefore, "balance shouldn't move for a purchase that never got this far");

    const purchasesAfter = ((await (await fetch(`${baseUrl}/purchases?customerId=${CUSTOMER_ID}`)).json()) as { data: Purchase[] }).data;
    assert.equal(purchasesAfter.length, purchasesBefore.length, "nothing should get saved for an unknown customer/product");
});

test("refunding more than what's left on a purchase is rejected", async () => {
    await setBalance(10);
    let res = await fetch(`${baseUrl}/purchases`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerId: CUSTOMER_ID, productId: PRODUCT_1, quantity: 1 }), // costs 2.99
    });
    const purchase = ((await res.json()) as { data: Purchase }).data;

    // asking for way more than the purchase even cost should just get rejected
    res = await fetch(`${baseUrl}/purchases/${purchase.id}/refund`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: 999 }),
    });
    assert.equal(res.status, 400);

    // fully refund it for real this time
    res = await fetch(`${baseUrl}/purchases/${purchase.id}/refund`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
    });
    assert.equal(res.status, 200);
    assert.equal((await res.json()).data.status, "REFUNDED");

    // there's nothing left to refund now, so this should also get rejected
    res = await fetch(`${baseUrl}/purchases/${purchase.id}/refund`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
    });
    assert.equal(res.status, 400);
});

test("credit ledger keeps an entry for the grant, the purchase, and the refund", async () => {
    await setBalance(0);
    const grantNote = `ledger-test-${crypto.randomUUID()}`;

    let res = await fetch(`${baseUrl}/credits/${CUSTOMER_ID}/grant`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: 50, note: grantNote }),
    });
    assert.equal(res.status, 200);

    res = await fetch(`${baseUrl}/purchases`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerId: CUSTOMER_ID, productId: PRODUCT_1, quantity: 1 }), // costs 2.99
    });
    const purchase = ((await res.json()) as { data: Purchase }).data;

    await fetch(`${baseUrl}/purchases/${purchase.id}/refund`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
    });

    const ledger = ((await (await fetch(`${baseUrl}/credits/${CUSTOMER_ID}/ledger`)).json()) as { data: CreditLedgerEntry[] }).data;

    const grantEntry = ledger.find(e => e.reason === "MANUAL_GRANT" && e.note === grantNote);
    assert.ok(grantEntry, "grant should show up in the ledger");
    assert.equal(grantEntry?.amount, 50);

    const purchaseEntry = ledger.find(e => e.reason === "PURCHASE" && e.relatedPurchaseId === purchase.id);
    assert.ok(purchaseEntry, "purchase should show up in the ledger, tied back to the purchase");
    assert.equal(purchaseEntry?.amount, -2.99);

    const refundEntry = ledger.find(e => e.reason === "REFUND" && e.relatedPurchaseId === purchase.id);
    assert.ok(refundEntry, "refund should show up in the ledger too, tied to the same purchase");
    assert.equal(refundEntry?.amount, 2.99);
});

test("a valid promo code discounts the purchase, an invalid one is rejected and never saved", async () => {
    await setBalance(100);
    const purchasesBefore = ((await (await fetch(`${baseUrl}/purchases?customerId=${CUSTOMER_ID}`)).json()) as { data: Purchase[] }).data;

    // SAVE10 = 10% off, product 1 x2 costs 5.98 -> 5.38 after discount
    let res = await fetch(`${baseUrl}/purchases`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerId: CUSTOMER_ID, productId: PRODUCT_1, quantity: 2, promoCode: "save10" }),
    });
    assert.equal(res.status, 200);
    const purchase = ((await res.json()) as { data: Purchase }).data;
    assert.equal(purchase.totalAmount, 5.38);
    assert.equal(purchase.promoCode, "save10");

    res = await fetch(`${baseUrl}/credits/${CUSTOMER_ID}/balance`);
    assertCloseTo((await res.json()).data.balance, 94.62, "balance should reflect the discounted total, not the full price");

    // a bogus promo code should reject the purchase entirely, nothing saved or deducted
    res = await fetch(`${baseUrl}/purchases`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerId: CUSTOMER_ID, productId: PRODUCT_1, quantity: 1, promoCode: "NOT-A-REAL-CODE" }),
    });
    assert.equal(res.status, 400);
    const body = (await res.json()) as { error: string };
    assert.match(body.error, /invalid/i);

    res = await fetch(`${baseUrl}/credits/${CUSTOMER_ID}/balance`);
    assertCloseTo((await res.json()).data.balance, 94.62, "balance shouldn't move for a rejected promo code");

    const purchasesAfter = ((await (await fetch(`${baseUrl}/purchases?customerId=${CUSTOMER_ID}`)).json()) as { data: Purchase[] }).data;
    assert.equal(purchasesAfter.length, purchasesBefore.length + 1, "only the valid-promo purchase should've been saved");
});

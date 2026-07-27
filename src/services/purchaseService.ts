import crypto from "crypto";
import { getCustomer, getProduct, createShipment, ExternalApiError } from "../externalApi/client";
import * as purchaseRepository from "../repository/purchaseRepository";
import * as promoRepository from "../repository/promoRepository";
import * as creditService from "./creditService";
import { Purchase, PromoCode } from "../types";
import { withLock } from "../utils/mutex";

export class PurchaseError extends Error {}
export class InvalidPromoCodeError extends PurchaseError {}

// Rounds to 2 decimals, half up (0.005 -> 0.01). The EPSILON fudge avoids floating point
// weirdness like 1.005 * 100 === 100.49999999999999.
function roundToTwoDecimals(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
}

export async function purchaseProduct(
    customerId: string,
    productId: string,
    quantity: number,
    promoCode?: string
): Promise<Purchase> {
    if (!Number.isFinite(quantity) || quantity <= 0) throw new PurchaseError("Quantity must be positive");

    // checking if promo code exists and if it has an expiration date, check if it is expired or not.
    // If they entered a promo code and it is inavlid or expired, we do not want the purchase to go through
    let promo: PromoCode | undefined;
    if (promoCode) {
        promo = promoRepository.findByCode(promoCode);
        if (!promo) throw new InvalidPromoCodeError(`Promo code "${promoCode}" is invalid`);
        if (promo.expiresAt !== undefined && promo.expiresAt < Date.now()) {
            throw new InvalidPromoCodeError(`Promo code "${promoCode}" has expired`);
        }
    }

    const customer = await getCustomer(customerId);
    const product = await getProduct(productId);


    const rawTotal = product.price * quantity;
    const discounted =
        promo?.discountType === "PERCENT" ? rawTotal * (1 - promo.discountValue / 100)
        : promo?.discountType === "FIXED" ? rawTotal - promo.discountValue
        : rawTotal;
    const totalAmount = roundToTwoDecimals(Math.max(discounted, 0));

    // Lock per customer so a concurrent purchase/refund can't sneak in between the balance
    // check and the deduction below and overdraw the account.
    return withLock(customerId, async () => {
        // Checks if valid Purchase before creating Shipment, since the opposite is specified.
        const balance = creditService.getCreditBalance(customerId);
        if (balance < totalAmount) {
            throw new PurchaseError("Insufficient credit balance");
        }

        // Try creating the Shipment, if it fails we do not create a purchase as specified.
        let shipmentId: string;
        try {
            const shipment = await createShipment({
                shippingAddress: customer.shippingAddress,
                products: [{ sku: product.sku, quantity }],
            });
            shipmentId = shipment.id;
        } catch (err) {
            const message = err instanceof ExternalApiError ? err.message : "Failed to create shipment";
            throw new PurchaseError(`Purchase failed: ${message}`);
        }

        const purchase: Purchase = {
            id: crypto.randomUUID(),
            customerId,
            productId,
            sku: product.sku,
            quantity,
            unitPrice: product.price,
            totalAmount,
            refundedAmount: 0,
            status: "COMPLETED",
            shipmentId,
            createdAt: Date.now(),
            refunds: [],
            promoCode,
        };

        purchaseRepository.save(purchase);
        creditService.applyCreditChangeUnlocked(customerId, -totalAmount, undefined, { reason: "PURCHASE", relatedPurchaseId: purchase.id });

        return purchase;
    });
}

export function listPurchases(customerId: string): Purchase[] {
    return purchaseRepository.listByCustomer(customerId);
}

// Refunds a purchase (fully or partially) and credits the amount back. Locked per customer,
// same reason as purchaseProduct.
export async function refundPurchase(purchaseId: string, amount?: number, note?: string): Promise<Purchase> {
    const purchase = purchaseRepository.findById(purchaseId);
    if (!purchase) throw new PurchaseError("Purchase not found");

    return withLock(purchase.customerId, async () => {
        const remainingRefundable = roundToTwoDecimals(purchase.totalAmount - purchase.refundedAmount);
        const refundAmount = amount !== undefined ? roundToTwoDecimals(amount) : remainingRefundable;

        if (!Number.isFinite(refundAmount) || refundAmount <= 0 || refundAmount > remainingRefundable) {
            throw new PurchaseError(`Refund amount must be between 0 and ${remainingRefundable}`);
        }

        const updated = purchaseRepository.addRefund(purchaseId, {
            id: crypto.randomUUID(),
            amount: refundAmount,
            note,
            createdAt: Date.now(),
        });

        creditService.applyCreditChangeUnlocked(purchase.customerId, refundAmount, note, { reason: "REFUND", relatedPurchaseId: purchaseId });

        return updated;
    });
}

// Manual delete of a purchase record, for correcting bugs/erroneous entries. Not exposed as part of
// normal flows.
export function deletePurchase(purchaseId: string): void {
    const deleted = purchaseRepository.deleteById(purchaseId);
    if (!deleted) throw new PurchaseError("Purchase not found");
}

import crypto from "crypto";
import { getCustomer, getProduct, createShipment, ExternalApiError } from "../externalApi/client";
import * as purchaseRepository from "../repository/purchaseRepository";
import * as creditService from "./creditService";
import { Purchase } from "../types";

export class PurchaseError extends Error {}

export async function purchaseProduct(customerId: string, productId: string, quantity: number): Promise<Purchase> {
    if (!Number.isFinite(quantity) || quantity <= 0) throw new PurchaseError("Quantity must be positive");

    const customer = await getCustomer(customerId);
    const product = await getProduct(productId);


    const totalAmount = product.price * quantity;
    
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
    };

    purchaseRepository.save(purchase);
    await creditService.updateCredit(customerId, -totalAmount, undefined, { reason: "PURCHASE", relatedPurchaseId: purchase.id });

    return purchase;
}

export function listPurchases(customerId: string): Purchase[] {
    return purchaseRepository.listByCustomer(customerId);
}

// Refunds Purchase based on given purchaseId. Checks if the purchase is refundable and updates the 
// Customer's credit.
export async function refundPurchase(purchaseId: string, amount?: number, note?: string): Promise<Purchase> {
    const purchase = purchaseRepository.findById(purchaseId);
    if (!purchase) throw new PurchaseError("Purchase not found");

    const remainingRefundable = purchase.totalAmount - purchase.refundedAmount;
    const refundAmount = amount ?? remainingRefundable;

    if (!Number.isFinite(refundAmount) || refundAmount <= 0 || refundAmount > remainingRefundable) {
        throw new PurchaseError(`Refund amount must be between 0 and ${remainingRefundable}`);
    }

    const updated = purchaseRepository.addRefund(purchaseId, {
        id: crypto.randomUUID(),
        amount: refundAmount,
        note,
        createdAt: Date.now(),
    });

    await creditService.updateCredit(purchase.customerId, refundAmount, note, { reason: "REFUND", relatedPurchaseId: purchaseId });

    return updated;
}

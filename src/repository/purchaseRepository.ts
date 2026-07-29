import { Purchase, RefundRecord } from "../types";

// In-memory storage for Purchase history, ideally would be put into a DB.

const purchases: Record<string, Purchase> = {};

// Creates Purchase
export function save(purchase: Purchase): void {
    purchases[purchase.id] = purchase;
}

// Get Purchase
export function findById(purchaseId: string): Purchase | undefined {
    return purchases[purchaseId];
}

// Get's Customer's purchase history
export function listByCustomer(customerId: string): Purchase[] {
    return Object.values(purchases).filter(p => p.customerId === customerId);
}

// Refunds a Customer's Purchase
export function addRefund(purchaseId: string, refund: RefundRecord): Purchase {
    const purchase = purchases[purchaseId];
    if (!purchase) throw new Error("Purchase not found");

    purchase.refunds.push(refund);
    purchase.refundedAmount += refund.amount;
    // >= used for Float point precision
    purchase.status = purchase.refundedAmount >= purchase.totalAmount ? "REFUNDED" : "PARTIALLY_REFUNDED"; 
    return purchase;
}

// Delete's purchase, manual debugging only
export function deleteById(purchaseId: string): boolean {
    if (!purchases[purchaseId]) return false;
    delete purchases[purchaseId];
    return true;
}

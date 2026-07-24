export interface Address {
    line1: string;
    line2: string;
    city: string;
    postalCode: string;
    state: string;
    country: string;
}

export interface Customer {
    id: string;
    name: string;
    billingAddress: Address;
    shippingAddress: Address;
    email: string;
    createdAt: number;
    lastModifiedAt: number;
}

export interface Product {
    id: string;
    sku: string;
    name: string;
    description: string;
    price: number;
    createdAt: number;
    lastModifiedAt: number;
}

export interface CreateShipmentRequest {
    shippingAddress: Address;
    products: { sku: string; quantity: number }[];
}

export interface CreateShipmentResponse {
    id: string;
}

export type CreditReason = "MANUAL_GRANT" | "MANUAL_DEDUCTION" | "PURCHASE" | "REFUND";

// Credit balance entries for audit purposes. Mocks up how we would store in a databse.
// Amount can be negative to be able to sum up credit in a window for credit balance historical snapshot purposes.
export interface CreditLedgerEntry {
    id: string;
    customerId: string;
    amount: number;
    balanceAfter: number;
    reason: CreditReason;
    note?: string;
    relatedPurchaseId?: string;
    createdAt: number;
}

export type PurchaseStatus = "COMPLETED" | "PARTIALLY_REFUNDED" | "REFUNDED";

export interface RefundRecord {
    id: string;
    amount: number;
    note?: string;
    createdAt: number;
}

// Purchase has appended refund record. Opted for this since you should only refund a purchase so many times.
export interface Purchase {
    id: string;
    customerId: string;
    productId: string;
    sku: string;
    quantity: number;
    unitPrice: number;
    totalAmount: number;
    refundedAmount: number;
    status: PurchaseStatus;
    shipmentId: string;
    createdAt: number;
    refunds: RefundRecord[];
}
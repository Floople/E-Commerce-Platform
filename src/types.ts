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
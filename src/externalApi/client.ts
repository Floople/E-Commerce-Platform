import { Customer, Product, CreateShipmentRequest, CreateShipmentResponse } from "../types";

// Client for the external Customer/Product/Shipment API.
// Makes sure customer/product data and shipment creation go throug here, not into our own persistence layer

const EXTERNAL_API_URL = process.env.EXTERNAL_API_URL ?? "http://localhost:3000";

export class ExternalApiError extends Error {
    constructor(message: string, public status: number) {
        super(message);
    }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${EXTERNAL_API_URL}${path}`, {
        ...init,
        headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    });
    if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new ExternalApiError(body.error ?? `Request to ${path} failed`, res.status);
    }
    return res.json() as Promise<T>;
}

export function getCustomer(customerId: string): Promise<Customer> {
    return request<Customer>(`/customers/${customerId}`);
}

export function getProduct(productId: string): Promise<Product> {
    return request<Product>(`/products/${productId}`);
}

export function createShipment(payload: CreateShipmentRequest): Promise<CreateShipmentResponse> {
    return request<CreateShipmentResponse>("/shipments", {
        method: "POST",
        body: JSON.stringify(payload),
    });
}

import express, { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import { Customer, Product, Address } from "../types";

// Mock of the external Customer/Product/Shipment API described in the API spec
// Something to call over HTTP during local dev/testing

interface ShipmentRecord {
    id: string;
    shippingAddress: Address;
    products: { sku: string; quantity: number }[];
}

// Example customer data, assume correct as we do not own
const customers: Record<string, Customer> = {
    "customer-uuid-123": {
        id: "customer-uuid-123",
        name: "Michael Zhang",
        email: "michaelzhang@gmail.com",
        billingAddress: { line1: "456 Broadway", line2: "1A",city: "New York", postalCode: "10013", state: "NY", country: "US" },
        shippingAddress: { line1: "456 Broadway", line2: "1A",city: "New York", postalCode: "10013", state: "NY", country: "US" },
        createdAt: 1784883600000,
        lastModifiedAt: 1784883600000,
    },
    "customer-uuid-456": {
        id: "customer-uuid-456",
        name: "Kevin Zhang",
        email: "kevinzhang@gmail.com",
        billingAddress: { line1: "789 Broadway", line2: "1B",city: "New York", postalCode: "10013", state: "NY", country: "US" },
        shippingAddress: { line1: "789 Broadway", line2: "1B",city: "New York", postalCode: "10013", state: "NY", country: "US" },
        createdAt: 1784883600000,
        lastModifiedAt: 1784883600000,
    },
};

//Example product data, assume correct as we do not own
const products: Record<string, Product> = {
    "product-uuid-1": {
        id: "product-uuid-1", 
        sku: "CHP-FUN-001", name: "Funions",
        description: "Savory onion ring style chips", 
        price: 2.99,
        createdAt: 1784883600000, lastModifiedAt: 1784883600000,
    },
    "product-uuid-2": {
        id: "product-uuid-2", 
        sku: "SNP-PCH-002", 
        name: "Snapple Peach Ice Tea",
        description: "Peach version of snapple Ice tea", price: 3.99,
        createdAt: 1784915261, lastModifiedAt: 1784915261,
    },
    "product-uuid-3": {
        id: "product-uuid-3", 
        sku: "SHM-TP-001", 
        name: "Charm Toilet Paper",
        description: "Toilet paper", price: 7.99,
        createdAt: 1785259879, lastModifiedAt: 1785259879,
    },
};

const shipments: Record<string, ShipmentRecord> = {};

const app = express();
app.use(express.json());

app.get("/customers/:customerId", (req: Request, res: Response) => {
    const customer = customers[req.params.customerId as string];
    if (!customer) return res.status(404).json({ error: "Customer not found" });
    res.json(customer);
});

app.get("/products/:productId", (req: Request, res: Response) => {
    const product = products[req.params.productId as string];
    if (!product) return res.status(404).json({ error: "Product not found" });
    res.json(product);
});

app.post("/shipments", (req: Request, res: Response) => {
    const id = crypto.randomUUID();
    shipments[id] = { id, ...(req.body as Omit<ShipmentRecord, "id">) };
    //console.log("Shipment created:", shipments[id]);
    res.json({ id });
});

app.use((req: Request, res: Response) => {
    res.status(404).json({ error: "Route not found" });
});

app.use((err: unknown, req: Request, res: Response, next: NextFunction) => {
    res.status(400).json({ error: "Invalid request body" });
});

export const server = app;

import express, { Request, Response, NextFunction } from "express";
import { ExternalApiError } from "./externalApi/client";
import { creditRoutes } from "./routes/creditRoutes";
import { purchaseRoutes } from "./routes/purchaseRoutes";
import { InsufficientCreditError } from "./services/creditService";
import { PurchaseError } from "./services/purchaseService";

const app = express();
app.use(express.json());

app.use("/credits", creditRoutes);
app.use("/purchases", purchaseRoutes);

app.use((req: Request, res: Response) => {
    res.status(404).json({ error: "Route not found" });
});

app.use((err: unknown, req: Request, res: Response, next: NextFunction) => {
    if (err instanceof PurchaseError || err instanceof InsufficientCreditError) {
        return res.status(400).json({ error: err.message });
    }
    if (err instanceof ExternalApiError) {
        return res.status(err.status === 404 ? 404 : 502).json({ error: err.message });
    }
    const message = err instanceof Error ? err.message : "Internal server error";
    res.status(500).json({ error: message });
});

export const server = app;

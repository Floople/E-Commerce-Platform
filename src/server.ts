import express, { Request, Response, NextFunction } from "express";
import { ExternalApiError } from "./externalApi/client";
import { creditRoutes } from "./routes/creditRoutes";
import { purchaseRoutes } from "./routes/purchaseRoutes";
import { CreditError, InsufficientCreditError } from "./services/creditService";
import { PurchaseError } from "./services/purchaseService";
import { sendError } from "./utils/apiResponse";

const app = express();
app.use(express.json());

app.use("/credits", creditRoutes);
app.use("/purchases", purchaseRoutes);

app.use((req: Request, res: Response) => {
    sendError(res, 404, "Route not found");
});

app.use((err: unknown, req: Request, res: Response, next: NextFunction) => {
    if (err instanceof PurchaseError || err instanceof InsufficientCreditError || err instanceof CreditError) {
        return sendError(res, 400, err.message);
    }
    if (err instanceof ExternalApiError) {
        return sendError(res, err.status === 404 ? 404 : 502, err.message);
    }
    const message = err instanceof Error ? err.message : "Internal server error";
    sendError(res, 500, message);
});

export const server = app;

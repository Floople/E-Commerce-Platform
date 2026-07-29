import { Router, Request, Response, NextFunction } from "express";
import * as purchaseService from "../services/purchaseService";
import { sendData, sendError } from "../utils/apiResponse";

export const purchaseRoutes = Router();

purchaseRoutes.post("/", async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { customerId, productId, quantity, promoCode } = req.body ?? {};
        const purchase = await purchaseService.purchaseProduct(customerId, productId, quantity, promoCode);
        sendData(res, purchase);
    } catch (err) {
        next(err);
    }
});

purchaseRoutes.get("/", (req: Request, res: Response) => {
    const customerId = req.query.customerId as string | undefined;
    if (!customerId) return sendError(res, 400, "customerId query param is required");
    sendData(res, purchaseService.listPurchases(customerId));
});

purchaseRoutes.post("/:id/refund", async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { amount, note } = req.body ?? {};
        const purchase = await purchaseService.refundPurchase(req.params.id as string, amount, note);
        sendData(res, purchase);
    } catch (err) {
        next(err);
    }
});

purchaseRoutes.delete("/:id", (req: Request, res: Response, next: NextFunction) => {
    try {
        purchaseService.deletePurchase(req.params.id as string);
        res.status(204).send();
    } catch (err) {
        next(err);
    }
});

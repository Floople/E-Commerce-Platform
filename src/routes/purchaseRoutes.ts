import { Router, Request, Response, NextFunction } from "express";
import * as purchaseService from "../services/purchaseService";

export const purchaseRoutes = Router();

purchaseRoutes.post("/", async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { customerId, productId, quantity } = req.body;
        const purchase = await purchaseService.purchaseProduct(customerId, productId, quantity);
        res.json(purchase);
    } catch (err) {
        next(err);
    }
});

purchaseRoutes.get("/", (req: Request, res: Response) => {
    const customerId = req.query.customerId as string | undefined;
    if (!customerId) return res.status(400).json({ error: "customerId query param is required" });
    res.json(purchaseService.listPurchases(customerId));
});

purchaseRoutes.post("/:id/refund", async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { amount, note } = req.body;
        const purchase = await purchaseService.refundPurchase(req.params.id as string, amount, note);
        res.json(purchase);
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

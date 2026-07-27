import { Router, Request, Response, NextFunction } from "express";
import * as creditService from "../services/creditService";
import { sendData, sendError } from "../utils/apiResponse";

export const creditRoutes = Router();

creditRoutes.post("/:customerId/grant", async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { amount, note } = req.body;
        if (!Number.isFinite(amount) || amount <= 0) {
            return sendError(res, 400, "Grant amount must be positive");
        }
        const entry = await creditService.updateCredit(req.params.customerId as string, amount, note);
        sendData(res, entry);
    } catch (err) {
        next(err);
    }
});

creditRoutes.post("/:customerId/deduct", async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { amount, note } = req.body;
        if (!Number.isFinite(amount) || amount <= 0) {
            return sendError(res, 400, "Deduction amount must be positive");
        }
        const entry = await creditService.updateCredit(req.params.customerId as string, -amount, note);
        sendData(res, entry);
    } catch (err) {
        next(err);
    }
});

creditRoutes.get("/:customerId/balance", (req: Request, res: Response) => {
    const balance = creditService.getCreditBalance(req.params.customerId as string);
    sendData(res, { customerId: req.params.customerId, balance });
});

creditRoutes.get("/:customerId/ledger", (req: Request, res: Response) => {
    sendData(res, creditService.getCreditLedger(req.params.customerId as string));
});

creditRoutes.delete("/entries/:entryId", async (req: Request, res: Response, next: NextFunction) => {
    try {
        await creditService.deleteCreditEntry(req.params.entryId as string);
        res.status(204).send();
    } catch (err) {
        next(err);
    }
});

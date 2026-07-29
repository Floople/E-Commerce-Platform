import { Router, Request, Response, NextFunction } from "express";
import * as creditService from "../services/creditService";
import { sendData, sendError } from "../utils/apiResponse";

export const creditRoutes = Router();

creditRoutes.post("/:customerId/grant", async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { amount, note } = req.body ?? {};
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
        const { amount, note } = req.body ?? {};
        if (!Number.isFinite(amount) || amount <= 0) {
            return sendError(res, 400, "Deduction amount must be positive");
        }
        const entry = await creditService.updateCredit(req.params.customerId as string, -amount, note);
        sendData(res, entry);
    } catch (err) {
        next(err);
    }
});

creditRoutes.get("/:customerId/balance", async (req: Request, res: Response, next: NextFunction) => {
    try {
        const balance = await creditService.getCreditBalance(req.params.customerId as string);
        sendData(res, { customerId: req.params.customerId, balance });
    } catch (err) {
        next(err);
    }
});

creditRoutes.get("/:customerId/ledger", async (req: Request, res: Response, next: NextFunction) => {
    try {
        const ledger = await creditService.getCreditLedger(req.params.customerId as string);
        sendData(res, ledger);
    } catch (err) {
        next(err);
    }
});

creditRoutes.delete("/entries/:entryId", async (req: Request, res: Response, next: NextFunction) => {
    try {
        await creditService.deleteCreditEntry(req.params.entryId as string);
        res.status(204).send();
    } catch (err) {
        next(err);
    }
});

import { Router, Request, Response, NextFunction } from "express";

export const creditRoutes = Router();

creditRoutes.post("/:customerId/grant", async (req: Request, res: Response, next: NextFunction) => {
    // Add to customer's balance
});

creditRoutes.post("/:customerId/deduct", async (req: Request, res: Response, next: NextFunction) => {
    // Deduct from customer's balance
});

creditRoutes.get("/:customerId/balance", (req: Request, res: Response) => {
    // Get customer's balance
});

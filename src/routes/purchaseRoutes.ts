import { Router, Request, Response, NextFunction } from "express";

export const purchaseRoutes = Router();

purchaseRoutes.post("/", async (req: Request, res: Response, next: NextFunction) => {
    // Create a purchase
});

purchaseRoutes.get("/", (req: Request, res: Response) => {
    // Get purchase
});

purchaseRoutes.post("/:id/refund", async (req: Request, res: Response, next: NextFunction) => {
    // Refund a purchase
});

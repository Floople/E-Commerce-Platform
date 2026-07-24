import * as creditRepository from "../repository/creditRepository";
import { getCustomer } from "../externalApi/client";
import { CreditLedgerEntry, CreditReason } from "../types";

export class InsufficientCreditError extends Error {}

// Get customer's current credit balance
export function getCreditBalance(customerId: string): number {
    return creditRepository.getBalance(customerId);
}

// Updates credit, if amount entered is positive or negative determins what the reasoning is.
// Attaches Purchase Id if made from a purchase. Errors our if we try to deduct more than we have or
// an invalid input comes in.
export async function updateCredit(
    customerId: string,
    amount: number,
    note?: string,
    context?: { reason: CreditReason; relatedPurchaseId?: string }
): Promise<CreditLedgerEntry> {
    if (!Number.isFinite(amount) || amount === 0) throw new Error("Amount must be a non-zero number");

    if (!context) {
        await getCustomer(customerId);
    }

    if (amount < 0) {
        const balance = creditRepository.getBalance(customerId);
        if (balance < -amount) throw new InsufficientCreditError("Customer does not have enough credit");
    }

    const reason = context?.reason ?? (amount > 0 ? "MANUAL_GRANT" : "MANUAL_DEDUCTION");
    return creditRepository.applyCreditChange(customerId, amount, reason, note, context?.relatedPurchaseId);
}
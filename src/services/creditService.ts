import * as creditRepository from "../repository/creditRepository";
import { getCustomer } from "../externalApi/client";
import { CreditLedgerEntry, CreditReason } from "../types";
import { withLock } from "../utils/mutex";

export class InsufficientCreditError extends Error {}
export class CreditError extends Error {}

// Get customer's current credit balance. Validates the customer actually exists first,
// so an unknown customerId 404s instead of silently coming back with a balance of 0.
export async function getCreditBalance(customerId: string): Promise<number> {
    await getCustomer(customerId);
    return creditRepository.getBalance(customerId);
}

// Get customer's credit ledger, for audit/historical record keeping purposes.
export async function getCreditLedger(customerId: string): Promise<CreditLedgerEntry[]> {
    await getCustomer(customerId);
    return creditRepository.getLedger(customerId);
}

// Locked per customer so concurrency is retained
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

    return withLock(customerId, async () => applyCreditChangeUnlocked(customerId, amount, note, context));
}

// Only call this while already customer locked
export function applyCreditChangeUnlocked(
    customerId: string,
    amount: number,
    note?: string,
    context?: { reason: CreditReason; relatedPurchaseId?: string }
): CreditLedgerEntry {
    if (amount < 0) {
        const balance = creditRepository.getBalance(customerId);
        if (balance < -amount) throw new InsufficientCreditError("Customer does not have enough credit");
    }

    const reason = context?.reason ?? (amount > 0 ? "MANUAL_GRANT" : "MANUAL_DEDUCTION");
    return creditRepository.applyCreditChange(customerId, amount, reason, note, context?.relatedPurchaseId);
}

export async function deleteCreditEntry(entryId: string): Promise<void> {
    const entry = creditRepository.findLedgerEntry(entryId);
    if (!entry) throw new CreditError("Credit ledger entry not found");

    await withLock(entry.customerId, async () => {
        creditRepository.deleteLedgerEntry(entryId);
    });
}
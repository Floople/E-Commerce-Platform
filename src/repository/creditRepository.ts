import crypto from "crypto";
import { CreditLedgerEntry, CreditReason } from "../types";

// In-memory storage for Credit history, ideally would be put into a DB.

const balances: Record<string, number> = {};
const ledger: CreditLedgerEntry[] = [];

export function getBalance(customerId: string): number {
    return balances[customerId] ?? 0;
}

export function applyCreditChange(
    customerId: string,
    amount: number,
    reason: CreditReason,
    note?: string,
    relatedPurchaseId?: string
): CreditLedgerEntry {
    const newBalance = (balances[customerId] ?? 0) + amount;
    balances[customerId] = newBalance;

    const entry: CreditLedgerEntry = {
        id: crypto.randomUUID(),
        customerId,
        amount,
        balanceAfter: newBalance,
        reason,
        note,
        relatedPurchaseId,
        createdAt: Date.now(),
    };
    ledger.push(entry);
    return entry;
}

export function getLedger(customerId: string): CreditLedgerEntry[] {
    return ledger.filter(entry => entry.customerId === customerId);
}

export function findLedgerEntry(entryId: string): CreditLedgerEntry | undefined {
    return ledger.find(entry => entry.id === entryId);
}

export function deleteLedgerEntry(entryId: string): CreditLedgerEntry | undefined {
    const index = ledger.findIndex(entry => entry.id === entryId);
    if (index === -1) return undefined;

    const [removed] = ledger.splice(index, 1);
    balances[removed.customerId] = (balances[removed.customerId] ?? 0) - removed.amount;
    return removed;
}

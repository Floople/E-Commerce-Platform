import { PromoCode } from "../types";

// Hardcoded for now promo codes
const promoCodes: Record<string, PromoCode> = {
    SAVE10: { code: "SAVE10", discountType: "PERCENT", discountValue: 10 },
    SAVE20: { code: "SAVE20", discountType: "PERCENT", discountValue: 20, expiresAt: new Date("2026-12-31").getTime() },
    "5OFF": { code: "5OFF", discountType: "FIXED", discountValue: 5 },
};

export function findByCode(code: string): PromoCode | undefined {
    return promoCodes[code.toUpperCase()];
}

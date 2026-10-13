import { items } from "@tests/utils/fixtures/items.js";

export const AUTO_TOPUP_WAIT_MS = 20000;
export const BURST_SUPPRESSION_TTL_MS = 35000;

// One pack = 100 units; quantity 100 tops up exactly one pack, so the invoice
// total equals the plan's per-pack price — the discriminator between plans.
export const oneOffItem = (price: number) =>
	items.oneOffMessages({ includedUsage: 0, billingUnits: 100, price });

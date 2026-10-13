import { items } from "@tests/utils/fixtures/items.js";

export const AUTO_TOPUP_WAIT_MS = 20000;
// Enabling auto_topup via update fires an on-enabled trigger that sets a 30s
// burst-suppression key; wait past its TTL before the real below-threshold track.
export const BURST_SUPPRESSION_TTL_MS = 35000;

export const oneOffItem = () =>
	items.oneOffMessages({ includedUsage: 0, billingUnits: 100, price: 10 });

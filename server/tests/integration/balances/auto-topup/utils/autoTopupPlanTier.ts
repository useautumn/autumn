import { items } from "@tests/utils/fixtures/items.js";

export const AUTO_TOPUP_WAIT_MS = 20000;
export const BURST_SUPPRESSION_TTL_MS = 35000;

export const oneOffItem = () =>
	items.oneOffMessages({ includedUsage: 0, billingUnits: 100, price: 10 });

import type { BillingPreviewResponse } from "@autumn/shared";

/** The preview fields facts are read from; every billing preview response has them. */
export type BillingPreviewTotals = Pick<
	BillingPreviewResponse,
	"total" | "next_cycle" | "incoming" | "outgoing" | "refund"
>;

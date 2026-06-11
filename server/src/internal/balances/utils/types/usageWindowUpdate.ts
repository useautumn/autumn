import type { UsageWindow } from "@autumn/shared";

/**
 * Post-deduction usage-window counter state for one capped feature, handed
 * down from the Lua result through the deduction flow to syncItemV4 (sibling
 * of DeductionUpdate / RolloverUpdate).
 *
 * Deliberately a SNAPSHOT, not a MutationLog-style delta: the deduction
 * script is atomic and the Postgres sync full-replaces rows per (customer,
 * feature), so the complete `usage_windows` array IS the update. An empty
 * array is meaningful (all windows pruned/closed) and still full-replaces.
 * Matches the `usage_window_updates` jsonb param of sync_balances_v2 1:1.
 */
export interface UsageWindowUpdate {
	internal_customer_id: string;
	feature_id: string;
	usage_windows: UsageWindow[];
}

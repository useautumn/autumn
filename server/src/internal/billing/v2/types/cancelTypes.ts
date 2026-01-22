import type { CusProductStatus } from "@autumn/shared";

// Re-export CancelMode from shared for convenience
export type { CancelMode } from "@shared/api/common/cancelMode";

/**
 * Updates to apply to a customer product when canceling or uncanceling.
 */
export interface CancelUpdates {
	canceled: boolean;
	canceled_at: number | null;
	ended_at: number | null;
	status?: CusProductStatus;
}

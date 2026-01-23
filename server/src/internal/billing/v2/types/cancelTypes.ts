import type { CusProductStatus } from "@autumn/shared";

// Re-export CancelAction from shared for convenience
export type { CancelAction } from "@shared/api/common/cancelMode";

/**
 * Updates to apply to a customer product when canceling or uncanceling.
 */
export interface CancelUpdates {
	canceled: boolean;
	canceled_at: number | null;
	ended_at: number | null;
	status?: CusProductStatus;
}

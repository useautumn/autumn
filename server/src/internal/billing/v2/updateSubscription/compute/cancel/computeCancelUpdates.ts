import { CusProductStatus } from "@autumn/shared";
import type { UpdateSubscriptionBillingContext } from "@/internal/billing/v2/billingContext";

export interface CancelUpdates {
	canceled: boolean;
	canceled_at: number;
	ended_at: number;
	status?: CusProductStatus;
}

/**
 * Builds the cancel field updates for a customer product.
 * For 'immediately' mode, includes status: Expired.
 * For 'end_of_cycle' mode, only sets cancel fields without status change.
 */
export const computeCancelUpdates = ({
	billingContext,
	endOfCycleMs,
}: {
	billingContext: UpdateSubscriptionBillingContext;
	endOfCycleMs: number;
}): CancelUpdates => {
	const { cancelMode, currentEpochMs } = billingContext;

	if (cancelMode === "immediately") {
		return {
			canceled: true,
			canceled_at: currentEpochMs,
			ended_at: currentEpochMs,
			status: CusProductStatus.Expired,
		};
	}

	return {
		canceled: true,
		canceled_at: currentEpochMs,
		ended_at: endOfCycleMs,
	};
};

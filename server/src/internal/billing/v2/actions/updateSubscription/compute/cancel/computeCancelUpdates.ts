import { CusProductStatus } from "@autumn/shared";
import type { UpdateSubscriptionBillingContext } from "@autumn/shared";

export interface CancelUpdates {
	canceled: boolean;
	canceled_at: number;
	ended_at: number;
	status?: CusProductStatus;
}

/**
 * Builds the cancel field updates for a customer product.
 * For 'cancel_immediately' mode, includes status: Expired.
 * For 'cancel_end_of_cycle' mode, only sets cancel fields without status change.
 */
export const computeCancelUpdates = ({
	billingContext,
	endOfCycleMs,
}: {
	billingContext: UpdateSubscriptionBillingContext;
	endOfCycleMs: number;
}): CancelUpdates => {
	const { cancelAction, currentEpochMs } = billingContext;

	if (cancelAction === "cancel_immediately") {
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

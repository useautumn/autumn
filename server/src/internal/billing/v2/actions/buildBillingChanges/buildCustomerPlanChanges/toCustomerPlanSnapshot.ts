import {
	CusProductStatus,
	customerProductToApiSubscriptionStatus,
	type FullCusProduct,
	isCustomerProductOneOff,
	type PurchaseSnapshot,
	type PurchaseStatus,
	type SubscriptionSnapshot,
} from "@autumn/shared";

const cusProductStatusToPurchaseStatus = (
	status: CusProductStatus,
): PurchaseStatus => {
	switch (status) {
		case CusProductStatus.Scheduled:
			return "scheduled";
		case CusProductStatus.Expired:
			return "expired";
		default:
			return "active";
	}
};

export type CustomerPlanSnapshotForChange =
	| { subscription: SubscriptionSnapshot; purchase?: undefined }
	| { subscription?: undefined; purchase: PurchaseSnapshot };

export type CustomerPlanSnapshotFields = {
	planId: string;
	status: CusProductStatus;
	isOneOff: boolean;
	startsAt: number | null;
	canceledAt: number | null;
	endedAt: number | null;
	trialEndsAt: number | null;
	nowMs?: number;
};

/** Snapshot core over plain fields — for senders that never load a
 * FullCusProduct (set-based migrations); `toCustomerPlanSnapshot` delegates here. */
export const toCustomerPlanSnapshotFromFields = ({
	planId,
	status,
	isOneOff,
	startsAt,
	canceledAt,
	endedAt,
	trialEndsAt,
	nowMs,
}: CustomerPlanSnapshotFields): CustomerPlanSnapshotForChange => {
	if (isOneOff) {
		return {
			purchase: {
				plan_id: planId,
				status: cusProductStatusToPurchaseStatus(status),
				expires_at: endedAt,
			},
		};
	}

	// trial_ends_at is only populated while actively trialing (mirrors getApiSubscription).
	const trialing = trialEndsAt !== null && trialEndsAt > (nowMs ?? Date.now());

	return {
		subscription: {
			plan_id: planId,
			status: customerProductToApiSubscriptionStatus({ status }),
			past_due: status === CusProductStatus.PastDue,
			started_at: startsAt,
			canceled_at: canceledAt,
			expires_at: endedAt,
			trial_ends_at: trialing ? trialEndsAt : null,
			current_period_start: null,
			current_period_end: null,
		},
	};
};

export const toCustomerPlanSnapshot = ({
	cusProduct,
}: {
	cusProduct: FullCusProduct;
}): CustomerPlanSnapshotForChange =>
	toCustomerPlanSnapshotFromFields({
		planId: cusProduct.product_id,
		status: cusProduct.status,
		isOneOff: isCustomerProductOneOff(cusProduct),
		startsAt: cusProduct.starts_at ?? null,
		canceledAt: cusProduct.canceled_at ?? null,
		endedAt: cusProduct.ended_at ?? null,
		trialEndsAt: cusProduct.trial_ends_at ?? null,
	});

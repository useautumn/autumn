import {
	CusProductStatus,
	type FullCusProduct,
	isCustomerProductOneOff,
	type PurchaseSnapshot,
	type PurchaseStatus,
	type SubscriptionSnapshot,
	type SubscriptionStatus,
} from "@autumn/shared";
import { cusProductStatusToPublicStatus } from "./cusProductStatusMapping";

const cusProductStatusToSubscriptionStatus = (
	status: CusProductStatus,
): SubscriptionStatus => cusProductStatusToPublicStatus(status);

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

export type CustomerPlanSnapshotOverrides = Partial<{
	status: CusProductStatus;
	canceled_at: number | null;
	ended_at: number | null;
	trial_ends_at: number | null;
}>;

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
			status: cusProductStatusToSubscriptionStatus(status),
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
	overrides,
}: {
	cusProduct: FullCusProduct;
	overrides?: CustomerPlanSnapshotOverrides;
}): CustomerPlanSnapshotForChange =>
	toCustomerPlanSnapshotFromFields({
		planId: cusProduct.product_id,
		status: overrides?.status ?? cusProduct.status,
		isOneOff: isCustomerProductOneOff(cusProduct),
		startsAt: cusProduct.starts_at ?? null,
		canceledAt:
			overrides?.canceled_at !== undefined
				? overrides.canceled_at
				: (cusProduct.canceled_at ?? null),
		endedAt:
			overrides?.ended_at !== undefined
				? overrides.ended_at
				: (cusProduct.ended_at ?? null),
		trialEndsAt:
			overrides?.trial_ends_at !== undefined
				? overrides.trial_ends_at
				: (cusProduct.trial_ends_at ?? null),
	});

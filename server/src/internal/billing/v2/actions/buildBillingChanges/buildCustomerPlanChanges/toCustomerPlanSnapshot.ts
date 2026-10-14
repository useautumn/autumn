import {
	CusProductStatus,
	customerProductToApiSubscriptionStatus,
	type FullCusProduct,
	isCustomerProductOneOff,
	type PurchaseSnapshot,
	type PurchaseStatus,
	type SubscriptionSnapshot,
} from "@autumn/shared";
import { customerProductToRevenueCatPeriod } from "@/external/revenueCat/utils/revenueCatPeriod";

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
	currentPeriodStart?: number | null;
	currentPeriodEnd?: number | null;
	nowMs?: number;
};

export const toCustomerPlanSnapshotFromFields = ({
	planId,
	status,
	isOneOff,
	startsAt,
	canceledAt,
	endedAt,
	trialEndsAt,
	currentPeriodStart = null,
	currentPeriodEnd = null,
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
			current_period_start: currentPeriodStart,
			current_period_end: currentPeriodEnd,
		},
	};
};

export const toCustomerPlanSnapshot = ({
	cusProduct,
}: {
	cusProduct: FullCusProduct;
}): CustomerPlanSnapshotForChange => {
	const revenueCatPeriod = customerProductToRevenueCatPeriod({
		customerProduct: cusProduct,
	});

	return toCustomerPlanSnapshotFromFields({
		planId: cusProduct.product_id,
		status: cusProduct.status,
		isOneOff: isCustomerProductOneOff(cusProduct),
		startsAt: cusProduct.starts_at ?? null,
		canceledAt: cusProduct.canceled_at ?? null,
		endedAt: cusProduct.ended_at ?? null,
		trialEndsAt: cusProduct.trial_ends_at ?? null,
		currentPeriodStart: revenueCatPeriod?.current_period_start,
		currentPeriodEnd: revenueCatPeriod?.current_period_end,
	});
};

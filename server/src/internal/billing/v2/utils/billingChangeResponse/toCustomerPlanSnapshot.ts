import {
	CusProductStatus,
	type FullCusProduct,
	isCustomerProductOneOff,
	isCustomerProductTrialing,
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

export const toCustomerPlanSnapshot = ({
	cusProduct,
	overrides,
}: {
	cusProduct: FullCusProduct;
	overrides?: CustomerPlanSnapshotOverrides;
}): CustomerPlanSnapshotForChange => {
	const status = overrides?.status ?? cusProduct.status;
	const endedAt =
		overrides?.ended_at !== undefined
			? overrides.ended_at
			: (cusProduct.ended_at ?? null);

	if (isCustomerProductOneOff(cusProduct)) {
		return {
			purchase: {
				plan_id: cusProduct.product_id,
				status: cusProductStatusToPurchaseStatus(status),
				expires_at: endedAt,
			},
		};
	}

	const canceledAt =
		overrides?.canceled_at !== undefined
			? overrides.canceled_at
			: (cusProduct.canceled_at ?? null);

	// Apply overrides for trial_ends_at if provided, else read from cusProduct
	// after substituting in any pending status. trial_ends_at on the public
	// snapshot is only populated while actively trialing (mirrors getApiSubscription).
	const rawTrialEndsAt =
		overrides?.trial_ends_at !== undefined
			? overrides.trial_ends_at
			: (cusProduct.trial_ends_at ?? null);

	const effectiveCusProductForTrialCheck: FullCusProduct = {
		...cusProduct,
		status,
		trial_ends_at: rawTrialEndsAt,
	};
	const trialEndsAt = isCustomerProductTrialing(effectiveCusProductForTrialCheck)
		? rawTrialEndsAt
		: null;

	return {
		subscription: {
			plan_id: cusProduct.product_id,
			status: cusProductStatusToSubscriptionStatus(status),
			past_due: status === CusProductStatus.PastDue,
			started_at: cusProduct.starts_at ?? null,
			canceled_at: canceledAt,
			expires_at: endedAt,
			trial_ends_at: trialEndsAt,
			current_period_start: null,
			current_period_end: null,
		},
	};
};

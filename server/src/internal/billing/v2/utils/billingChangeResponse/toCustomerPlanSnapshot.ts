import {
	type CustomerPlanSnapshot,
	type CustomerPlanStatus,
	CusProductStatus,
	type FullCusProduct,
} from "@autumn/shared";

const cusProductStatusToPlanStatus = (
	status: CusProductStatus,
): CustomerPlanStatus => {
	switch (status) {
		case CusProductStatus.Active:
			return "active";
		case CusProductStatus.Trialing:
			return "trialing";
		case CusProductStatus.PastDue:
			return "past_due";
		case CusProductStatus.Scheduled:
			return "scheduled";
		case CusProductStatus.Expired:
			return "expired";
		case CusProductStatus.Paused:
			return "paused";
		default:
			return "active";
	}
};

export type CustomerPlanSnapshotOverrides = Partial<{
	status: CusProductStatus;
	canceled_at: number | null;
	ended_at: number | null;
}>;

export const toCustomerPlanSnapshot = ({
	cusProduct,
	overrides,
}: {
	cusProduct: FullCusProduct;
	overrides?: CustomerPlanSnapshotOverrides;
}): CustomerPlanSnapshot => {
	const status = overrides?.status ?? cusProduct.status;
	const canceledAt =
		overrides?.canceled_at !== undefined
			? overrides.canceled_at
			: (cusProduct.canceled_at ?? null);
	const endedAt =
		overrides?.ended_at !== undefined
			? overrides.ended_at
			: (cusProduct.ended_at ?? null);

	return {
		plan_id: cusProduct.product_id,
		status: cusProductStatusToPlanStatus(status),
		started_at: cusProduct.starts_at ?? null,
		canceled_at: canceledAt,
		expires_at: endedAt,
		current_period_start: null,
		current_period_end: null,
	};
};

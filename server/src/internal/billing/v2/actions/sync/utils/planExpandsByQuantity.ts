import type { SyncPlanInstance } from "@autumn/shared";

export const planExpandsByQuantity = ({
	plan,
	isAddOn,
}: {
	plan: SyncPlanInstance;
	isAddOn: boolean;
}): boolean => {
	if (isAddOn) return true;
	const hasPurchasedUnits =
		(plan.license_quantities?.length ?? 0) > 0 ||
		(plan.feature_quantities ?? []).some(
			(option) => (option.quantity ?? 0) > 0,
		);
	return !hasPurchasedUnits;
};

import type { SyncPlanInstance } from "@autumn/shared";

/**
 * Whether a plan's Stripe quantity becomes one row per unit. Add-ons always
 * do. A main plan does only when it carries no purchased units (prepaid
 * quantities or seats): those are bought once for the subscription, so
 * splitting the plan would repeat them on every row.
 */
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

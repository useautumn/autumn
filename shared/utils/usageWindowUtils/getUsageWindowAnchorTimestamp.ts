import { EntInterval } from "../../models/productModels/intervals/entitlementInterval.js";

const RESET_INTERVALS_ALIGNED_TO_WINDOW: Partial<
	Record<EntInterval, readonly EntInterval[]>
> = {
	[EntInterval.Day]: [
		EntInterval.Day,
		EntInterval.Week,
		EntInterval.Month,
		EntInterval.Quarter,
		EntInterval.SemiAnnual,
		EntInterval.Year,
	],
	[EntInterval.Week]: [EntInterval.Week],
	[EntInterval.Month]: [
		EntInterval.Month,
		EntInterval.Quarter,
		EntInterval.SemiAnnual,
		EntInterval.Year,
	],
	[EntInterval.Year]: [EntInterval.Year],
};

const resetIntervalAlignsToWindow = ({
	resetInterval,
	windowInterval,
}: {
	resetInterval: EntInterval | null | undefined;
	windowInterval: EntInterval;
}): boolean =>
	resetInterval != null &&
	(RESET_INTERVALS_ALIGNED_TO_WINDOW[windowInterval]?.includes(resetInterval) ??
		false);

export const getUsageWindowAnchorTimestamp = ({
	anchorCustomerEntitlement,
	windowInterval,
}: {
	anchorCustomerEntitlement?: {
		next_reset_at: number | null;
		reset_cycle_anchor?: number | null;
		entitlement: { interval?: EntInterval | null };
		customer_product?: {
			billing_cycle_anchor_resets_at?: number | null;
		} | null;
	};
	windowInterval: EntInterval;
}): number | null => {
	if (!anchorCustomerEntitlement) return null;

	const resetAlignsToWindow = resetIntervalAlignsToWindow({
		resetInterval: anchorCustomerEntitlement.entitlement.interval,
		windowInterval,
	});
	if (resetAlignsToWindow) {
		return (
			anchorCustomerEntitlement.next_reset_at ??
			anchorCustomerEntitlement.customer_product
				?.billing_cycle_anchor_resets_at ??
			null
		);
	}

	return anchorCustomerEntitlement.reset_cycle_anchor ?? null;
};

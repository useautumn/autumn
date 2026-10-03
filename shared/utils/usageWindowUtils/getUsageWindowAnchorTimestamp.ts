import { EntInterval } from "../../models/productModels/intervals/entitlementInterval.js";

/**
 * Entitlement reset intervals that are a whole multiple of each window
 * interval. An entitlement on one of these only moves its `next_reset_at` on a
 * window boundary, so it phases the window without ever shifting it. Weeks do
 * not divide months or years, so a weekly window only follows a weekly reset.
 */
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

/**
 * The timestamp a usage window's bounds align to. The anchor entitlement's
 * `next_reset_at` is used only when its reset interval is a whole multiple of
 * the window's, so the window rolls WITH the entitlement's cycle (and a plan
 * change that restarts the cycle restarts the window). An entitlement that
 * resets more often than the window (daily credits under a monthly cap) would
 * drag the window forward on every reset and zero its counter, so it anchors
 * to its fixed `reset_cycle_anchor` instead. Falls back to the product's
 * billing-cycle anchor, else null (UTC calendar).
 */
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
	if (resetAlignsToWindow && anchorCustomerEntitlement.next_reset_at != null) {
		return anchorCustomerEntitlement.next_reset_at;
	}

	return (
		anchorCustomerEntitlement.reset_cycle_anchor ??
		anchorCustomerEntitlement.customer_product
			?.billing_cycle_anchor_resets_at ??
		null
	);
};

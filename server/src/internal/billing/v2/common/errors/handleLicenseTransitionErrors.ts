import { type AutumnBillingPlan, ErrCode, RecaseError } from "@autumn/shared";

/** Inline/queued repoints are single set-based statements, but the write
 * burst on a giant pool still needs a ceiling until proven further. */
const MAX_REPOINT_ROWS = 50_000;

/**
 * Guards every license transition on the plan (attach and update both):
 * a pool may not shrink below its live assignments, and a definition change
 * may not repoint more customer_prices/customer_entitlements rows than the
 * budget. Row counts derive from pool counters — no queries.
 */
export const handleLicenseTransitionErrors = ({
	autumnBillingPlan,
}: {
	autumnBillingPlan: AutumnBillingPlan;
}) => {
	for (const transition of autumnBillingPlan.customerLicenseTransitions ?? []) {
		const { updates, priceTransitions, entitlementTransitions } = transition;
		const liveSeats = updates.granted - updates.remaining;

		if (updates.remaining < 0) {
			throw new RecaseError({
				message:
					`License changes conflict with active license assignments: ` +
					`${liveSeats} assigned, but the incoming plan grants ${updates.granted}. Release licenses first.`,
				code: ErrCode.InvalidRequest,
				statusCode: 400,
			});
		}

		const priceRows = liveSeats * priceTransitions.length;
		const entitlementRows = liveSeats * entitlementTransitions.length;
		if (priceRows > MAX_REPOINT_ROWS || entitlementRows > MAX_REPOINT_ROWS) {
			throw new RecaseError({
				message:
					`License definition changes support re-pricing up to ${MAX_REPOINT_ROWS} seat rows per license; ` +
					`this change touches ${Math.max(priceRows, entitlementRows)}.`,
				code: ErrCode.InvalidRequest,
				statusCode: 400,
			});
		}
	}
};

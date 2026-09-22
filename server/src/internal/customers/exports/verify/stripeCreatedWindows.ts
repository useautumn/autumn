import { addDays, getUnixTime, isBefore } from "date-fns";
import type Stripe from "stripe";
import { billingVerifyExportConfig } from "./billingVerifyExportConfig.js";

/** Disjoint, gap-free `created` ranges covering every subscription: one open
 * window before `sinceMs`, fixed-length windows up to `untilMs`, then one open
 * window after, so no boundary can drop a subscription. */
export const stripeCreatedWindows = ({
	sinceMs,
	untilMs,
	windowDays = billingVerifyExportConfig.sweep.windowDays,
}: {
	sinceMs: number;
	untilMs: number;
	windowDays?: number;
}): Stripe.RangeQueryParam[] => {
	const until = new Date(untilMs);
	const boundaries: number[] = [];
	for (
		let cursor = new Date(sinceMs);
		isBefore(cursor, until);
		cursor = addDays(cursor, windowDays)
	) {
		boundaries.push(getUnixTime(cursor));
	}
	if (boundaries.length === 0) return [{}];

	const windows: Stripe.RangeQueryParam[] = [{ lt: boundaries[0] }];
	for (let i = 0; i < boundaries.length - 1; i++) {
		windows.push({ gte: boundaries[i], lt: boundaries[i + 1] });
	}
	windows.push({ gte: boundaries[boundaries.length - 1] });
	return windows;
};

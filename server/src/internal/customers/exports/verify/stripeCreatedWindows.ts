import { addMonths } from "date-fns";
import type Stripe from "stripe";
import { billingVerifyExportConfig } from "./billingVerifyExportConfig.js";

const toSeconds = (ms: number) => Math.floor(ms / 1000);

/** Disjoint, gap-free `created` ranges covering every subscription: one open
 * window before `sinceMs`, monthly windows up to `untilMs`, then one open
 * window after, so no month boundary can drop a subscription. */
export const stripeCreatedWindows = ({
	sinceMs,
	untilMs,
	windowMonths = billingVerifyExportConfig.sweep.windowMonths,
}: {
	sinceMs: number;
	untilMs: number;
	windowMonths?: number;
}): Stripe.RangeQueryParam[] => {
	const boundaries: number[] = [];
	for (
		let cursor = new Date(sinceMs);
		cursor.getTime() < untilMs;
		cursor = addMonths(cursor, windowMonths)
	) {
		boundaries.push(toSeconds(cursor.getTime()));
	}
	if (boundaries.length === 0) return [{}];

	const windows: Stripe.RangeQueryParam[] = [{ lt: boundaries[0] }];
	for (let i = 0; i < boundaries.length - 1; i++) {
		windows.push({ gte: boundaries[i], lt: boundaries[i + 1] });
	}
	windows.push({ gte: boundaries[boundaries.length - 1] });
	return windows;
};

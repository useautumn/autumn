import { UTCDate } from "@date-fns/utc";
import { subMonths } from "date-fns";
import { calculateProrationFromPeriod } from "./calculateProration";

/**
 * First charge of a new subscription created on a future monthly anchor.
 * Stripe prorates the stub over the full month that ends at the anchor.
 */
export const calculateNewSubscriptionAnchorStub = ({
	advancedTo,
	anchorMs,
	amount,
}: {
	advancedTo: number;
	anchorMs: number;
	amount: number;
}): number =>
	calculateProrationFromPeriod({
		billingPeriod: {
			start: subMonths(new UTCDate(anchorMs), 1).getTime(),
			end: anchorMs,
		},
		advancedTo,
		amount,
	});

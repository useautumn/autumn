import { UTCDate } from "@date-fns/utc";
import { subMonths, subYears } from "date-fns";
import { calculateProrationFromPeriod } from "./calculateProration";

/**
 * First charge of a new subscription created on a future anchor.
 * Stripe prorates the stub over the full interval that ends at the anchor.
 */
export const calculateNewSubscriptionAnchorStub = ({
	advancedTo,
	anchorMs,
	amount,
	interval = "month",
}: {
	advancedTo: number;
	anchorMs: number;
	amount: number;
	interval?: "month" | "year";
}): number =>
	calculateProrationFromPeriod({
		billingPeriod: {
			start: (interval === "year" ? subYears : subMonths)(
				new UTCDate(anchorMs),
				1,
			).getTime(),
			end: anchorMs,
		},
		advancedTo,
		amount,
	});

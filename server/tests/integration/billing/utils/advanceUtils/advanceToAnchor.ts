import { advanceTestClock } from "@tests/utils/stripeUtils";
import type Stripe from "stripe";

const DAY_MS = 1000 * 60 * 60 * 24;

export const advanceToAnchor = async ({
	stripeCli,
	testClockId,
	advancedTo,
	anchorMs,
}: {
	stripeCli: Stripe;
	testClockId: string;
	advancedTo: number;
	anchorMs: number;
}) => {
	const daysUntilAnchor = Math.ceil((anchorMs - advancedTo) / DAY_MS);

	await advanceTestClock({
		stripeCli,
		testClockId,
		startingFrom: new Date(advancedTo),
		numberOfDays: daysUntilAnchor + 1,
	});
};

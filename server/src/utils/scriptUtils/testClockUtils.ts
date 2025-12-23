import {
	addDays,
	addHours,
	addMinutes,
	addMonths,
	addWeeks,
	format,
} from "date-fns";
import type { Stripe } from "stripe";
import { timeout } from "../genUtils.js";

export const getStripeNow = async ({
	stripeCli,
	stripeCus,
	stripeSub,
	testClockId,
}: {
	stripeCli: Stripe;
	stripeCus?: Stripe.Customer;
	stripeSub?: Stripe.Subscription;
	testClockId?: string;
}) => {
	if (testClockId) {
		try {
			const stripeClock =
				await stripeCli.testHelpers.testClocks.retrieve(testClockId);
			return stripeClock.frozen_time * 1000;
		} catch (error) {}
	}

	if (stripeSub && !stripeSub.livemode && stripeSub.test_clock) {
		try {
			const stripeClock = await stripeCli.testHelpers.testClocks.retrieve(
				stripeSub.test_clock as string,
			);
			return stripeClock.frozen_time * 1000;
		} catch (error) {}
	}

	if (stripeCus && !stripeCus.livemode && stripeCus.test_clock) {
		try {
			const stripeClock = await stripeCli.testHelpers.testClocks.retrieve(
				stripeCus.test_clock as string,
			);
			return stripeClock.frozen_time * 1000;
		} catch (error) {}
	}

	return Date.now();
};

export const advanceTestClock = async ({
	stripeCli,
	testClockId,
	startingFrom,
	numberOfDays,
	numberOfWeeks,
	numberOfHours,
	numberOfMonths,
	advanceTo,
	waitForSeconds,
}: {
	stripeCli: Stripe;
	testClockId: string;
	numberOfDays?: number;
	startingFrom?: Date;
	numberOfWeeks?: number;
	numberOfHours?: number;
	numberOfMonths?: number;
	advanceTo?: number;
	waitForSeconds?: number;
}) => {
	if (!startingFrom) {
		startingFrom = new Date();
	}

	if (numberOfDays) {
		advanceTo = addDays(startingFrom, numberOfDays).getTime();
	}

	if (numberOfWeeks) {
		advanceTo = addWeeks(startingFrom, numberOfWeeks).getTime();
	}

	if (numberOfHours) {
		advanceTo = addHours(startingFrom, numberOfHours).getTime();
	}

	if (numberOfMonths) {
		advanceTo = addMonths(startingFrom, numberOfMonths).getTime();
	}

	if (!advanceTo) {
		advanceTo = addMinutes(addMonths(startingFrom, 1), 10).getTime();
	}

	console.log("   - Advancing to: ", format(advanceTo, "yyyy MMM dd HH:mm:ss"));
	await stripeCli.testHelpers.testClocks.advance(testClockId, {
		frozen_time: Math.floor(advanceTo / 1000),
	});

	if (waitForSeconds) {
		await timeout(waitForSeconds * 1000);
	}

	return advanceTo;

	// await timeout(
	//   waitForSeconds ? waitForSeconds * 1000 : STRIPE_TEST_CLOCK_TIMING,
	// );
};

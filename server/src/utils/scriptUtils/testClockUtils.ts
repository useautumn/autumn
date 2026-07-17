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

// Deadline mirrors the fixed sleep it replaces: on expiry or poll error we proceed, never throw.
export const pollWithDeadline = async ({
	pollUntil,
	deadlineMs,
	intervalMs = 2000,
}: {
	pollUntil: () => Promise<boolean>;
	deadlineMs: number;
	intervalMs?: number;
}): Promise<boolean> => {
	const deadline = Date.now() + deadlineMs;
	while (Date.now() < deadline) {
		try {
			if (await pollUntil()) return true;
		} catch {
			// Treat poll errors as "not ready yet" and keep waiting.
		}
		const remainingMs = deadline - Date.now();
		if (remainingMs <= 0) break;
		await timeout(Math.min(intervalMs, remainingMs));
	}
	return false;
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
	pollUntil,
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
	pollUntil?: () => Promise<boolean>;
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
		if (pollUntil) {
			await pollWithDeadline({ pollUntil, deadlineMs: waitForSeconds * 1000 });
		} else {
			await timeout(waitForSeconds * 1000);
		}
	}

	return advanceTo;

	// await timeout(
	//   waitForSeconds ? waitForSeconds * 1000 : STRIPE_TEST_CLOCK_TIMING,
	// );
};

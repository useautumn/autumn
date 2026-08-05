import {
	type ClockSettleMode,
	captureClockInvoiceBaseline,
	LEGACY_WAIT_POLL_THRESHOLD_MS,
	waitForClockInvoiceSettle,
	waitForClockReady,
} from "@tests/utils/testClockSettleUtils.js";
import {
	addDays,
	addHours,
	addMinutes,
	addMonths,
	addWeeks,
	format,
} from "date-fns";
import type { Stripe } from "stripe";
import type { AutumnInt } from "@/external/autumn/autumnCli.js";
import { timeout } from "../genUtils.js";

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
	settleMode,
	settleTimeoutMs,
	autumn,
	customerId,
}: {
	stripeCli: Stripe;
	testClockId: string;
	numberOfDays?: number;
	startingFrom?: Date;
	numberOfWeeks?: number;
	numberOfHours?: number;
	numberOfMonths?: number;
	advanceTo?: number;
	/** Legacy blind wait, for advances with no observable consequence to poll
	 * for. Ignored when `settleMode` is set — polling supersedes it. */
	waitForSeconds?: number;
	/** Poll for the boundary's invoice instead of sleeping. Set it only when this
	 * advance crosses a billing boundary; see ClockSettleMode. */
	settleMode?: ClockSettleMode;
	settleTimeoutMs?: number;
	autumn?: AutumnInt;
	customerId?: string;
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
	// Stripe rejects mutations while a clock is advancing, so never fire an
	// advance (or read state back) while the previous one is still in flight.
	await waitForClockReady({ stripeCli, testClockId });

	// A long explicit wait was chosen to cover a cycle boundary, so poll for that
	// boundary instead — and fall back to the wait if it never materialises.
	const legacyWaitMs =
		!settleMode &&
		waitForSeconds &&
		waitForSeconds * 1000 >= LEGACY_WAIT_POLL_THRESHOLD_MS
			? waitForSeconds * 1000
			: undefined;

	const baseline =
		settleMode || legacyWaitMs
			? await captureClockInvoiceBaseline({
					stripeCli,
					testClockId,
					autumn,
					customerId,
				})
			: null;

	await stripeCli.testHelpers.testClocks.advance(testClockId, {
		frozen_time: Math.floor(advanceTo / 1000),
	});
	await waitForClockReady({ stripeCli, testClockId });

	if (baseline) {
		await waitForClockInvoiceSettle({
			stripeCli,
			baseline,
			mode: settleMode,
			timeoutMs: settleTimeoutMs,
			legacyWaitMs,
		});
		return advanceTo;
	}

	if (waitForSeconds) {
		await timeout(waitForSeconds * 1000);
	}

	return advanceTo;
};

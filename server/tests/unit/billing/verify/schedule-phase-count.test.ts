/**
 * Autumn keeps a customer_product row for the phase running now and the phases
 * still to come. Stripe keeps elapsed phases on the schedule for the whole
 * term, so counting every Stripe phase reported a phase_count_mismatch on
 * subscriptions whose live phases matched Autumn exactly.
 *
 * Red (before):  an elapsed phase plus two live ones reads as 3 vs 2.
 * Green (after): only phases that have not ended are counted.
 */

import { describe, expect, it } from "bun:test";
import { getUnixTime } from "date-fns";
import type Stripe from "stripe";
import { evaluateSchedulePhases } from "@/internal/billing/v2/actions/verify/evaluate/evaluateSchedulePhases.js";

const nowSeconds = getUnixTime(new Date());
const DAY = 24 * 60 * 60;

const phase = ({ start, end }: { start: number; end: number | null }) =>
	({
		start_date: start,
		end_date: end,
		items: [{ price: { id: "price_a" }, quantity: 1 }],
		add_invoice_items: [],
	}) as unknown as Stripe.SubscriptionSchedule.Phase;

const evaluate = async ({
	phases,
	currentPhaseStart,
	expectedStarts,
}: {
	phases: Stripe.SubscriptionSchedule.Phase[];
	currentPhaseStart: number;
	expectedStarts: number[];
}) => {
	const stripeCli = {
		subscriptionSchedules: {
			retrieve: async () => ({
				id: "sub_sched_1",
				phases,
				current_phase: { start_date: currentPhaseStart },
			}),
		},
	} as unknown as Stripe;

	return await evaluateSchedulePhases({
		stripeCli,
		sub: { schedule: "sub_sched_1" } as unknown as Stripe.Subscription,
		scheduledPhases: expectedStarts.map((start) => ({
			start_date: start,
			items: [],
		})) as never,
		storedPriceCatalog: new Map() as never,
		cusPriceCatalog: new Map() as never,
		org: { id: "org_1" } as never,
	});
};

const countMismatches = (mismatches: Awaited<ReturnType<typeof evaluate>>) =>
	mismatches.filter(
		(mismatch) =>
			mismatch.type === "schedule_mismatch" &&
			mismatch.reason === "phase_count_mismatch",
	);

describe("evaluateSchedulePhases phase count", () => {
	it("ignores a phase that has already ended", async () => {
		const liveStart = nowSeconds - DAY;
		const futureStart = nowSeconds + 30 * DAY;

		const mismatches = await evaluate({
			phases: [
				phase({ start: nowSeconds - 400 * DAY, end: liveStart }),
				phase({ start: liveStart, end: futureStart }),
				phase({ start: futureStart, end: futureStart + 90 * DAY }),
			],
			currentPhaseStart: liveStart,
			expectedStarts: [liveStart, futureStart],
		});

		expect(countMismatches(mismatches)).toHaveLength(0);
	});

	it("still reports a genuine extra live phase", async () => {
		const liveStart = nowSeconds - DAY;
		const futureStart = nowSeconds + 30 * DAY;
		const extraStart = nowSeconds + 120 * DAY;

		const mismatches = await evaluate({
			phases: [
				phase({ start: liveStart, end: futureStart }),
				phase({ start: futureStart, end: extraStart }),
				phase({ start: extraStart, end: null }),
			],
			currentPhaseStart: liveStart,
			expectedStarts: [liveStart, futureStart],
		});

		expect(countMismatches(mismatches)).toHaveLength(1);
		expect(countMismatches(mismatches)[0]).toMatchObject({
			expected_phase_count: 2,
			actual_phase_count: 3,
		});
	});

	it("counts an open-ended phase as live", async () => {
		const liveStart = nowSeconds - DAY;

		const mismatches = await evaluate({
			phases: [
				phase({ start: nowSeconds - 400 * DAY, end: liveStart }),
				phase({ start: liveStart, end: null }),
			],
			currentPhaseStart: liveStart,
			expectedStarts: [liveStart],
		});

		expect(countMismatches(mismatches)).toHaveLength(0);
	});
});

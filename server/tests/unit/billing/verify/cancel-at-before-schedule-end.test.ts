/**
 * Stripe cancels a subscription at the earlier of sub.cancel_at and its
 * schedule's end. simple_cancel only consulted sub.cancel_at when there was no
 * schedule, so a cancel_at matching Autumn reported a cancel_state_mismatch
 * whenever a schedule happened to run past it.
 *
 * Red (before):  cancel_at == Autumn's ended_at still reports, because the
 *                schedule's own end is later.
 * Green (after): with no upcoming phases, a matching cancel_at is the cancel.
 */

import { describe, expect, it } from "bun:test";
import { getUnixTime } from "date-fns";
import type Stripe from "stripe";
import { evaluateCancelState } from "@/internal/billing/v2/actions/verify/evaluate/evaluateCancelState.js";

const nowSeconds = getUnixTime(new Date());
const DAY = 24 * 60 * 60;

const evaluate = async ({
	cancelAt,
	scheduleEnd,
	upcomingPhaseStart,
	endBehavior = "cancel",
	cancelAtSeconds,
}: {
	cancelAt: number | null;
	scheduleEnd: number;
	upcomingPhaseStart?: number;
	endBehavior?: Stripe.SubscriptionSchedule.EndBehavior;
	cancelAtSeconds?: number;
}) => {
	const items = [{ price: { id: "price_a" }, quantity: 1 }];
	const phases = [
		{ start_date: nowSeconds - 30 * DAY, end_date: scheduleEnd, items },
		...(upcomingPhaseStart
			? [{ start_date: upcomingPhaseStart, end_date: scheduleEnd, items }]
			: []),
	];

	const stripeCli = {
		subscriptionSchedules: {
			retrieve: async () => ({
				id: "sub_sched_1",
				status: "active",
				end_behavior: endBehavior,
				current_phase: { start_date: phases[0].start_date },
				phases,
			}),
		},
	} as unknown as Stripe;

	return await evaluateCancelState({
		stripeCli,
		sub: {
			id: "sub_1",
			schedule: "sub_sched_1",
			cancel_at: cancelAt,
		} as unknown as Stripe.Subscription,
		scenario: "simple_cancel",
		cancelAtSeconds,
		orgId: "org_without_overrides",
	});
};

describe("simple_cancel with a schedule running past the cancel", () => {
	const expectedCancel = nowSeconds + 60 * DAY;

	it("accepts cancel_at matching Autumn when the schedule ends later", async () => {
		expect(
			await evaluate({
				cancelAt: expectedCancel,
				scheduleEnd: nowSeconds + 330 * DAY,
				cancelAtSeconds: expectedCancel,
			}),
		).toBeUndefined();
	});

	it("still reports when cancel_at disagrees with Autumn", async () => {
		expect(
			await evaluate({
				cancelAt: expectedCancel + 10 * DAY,
				scheduleEnd: nowSeconds + 330 * DAY,
				cancelAtSeconds: expectedCancel,
			}),
		).toMatchObject({ type: "cancel_state_mismatch" });
	});

	it("still reports when the subscription is not canceling at all", async () => {
		expect(
			await evaluate({
				cancelAt: null,
				scheduleEnd: nowSeconds + 330 * DAY,
				cancelAtSeconds: expectedCancel,
			}),
		).toMatchObject({ type: "cancel_state_mismatch" });
	});

	it("still reports an unexpected schedule when a phase is upcoming", async () => {
		expect(
			await evaluate({
				cancelAt: expectedCancel,
				scheduleEnd: nowSeconds + 330 * DAY,
				upcomingPhaseStart: nowSeconds + 10 * DAY,
				cancelAtSeconds: expectedCancel,
			}),
		).toMatchObject({
			type: "schedule_mismatch",
			reason: "unexpected_schedule",
		});
	});
});

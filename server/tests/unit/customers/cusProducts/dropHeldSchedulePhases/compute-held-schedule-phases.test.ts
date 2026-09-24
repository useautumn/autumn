/**
 * computeHeldSchedulePhases
 *
 * Held rows are the scheduled rows pointing at the schedule; phase-end rows are
 * the live rows on its subscription whose end date sits on a phase boundary.
 * A released schedule names its subscription under released_subscription.
 */

import { describe, expect, test } from "bun:test";
import { CusProductStatus, type FullCustomer } from "@autumn/shared";
import type Stripe from "stripe";
import { computeHeldSchedulePhases } from "@/internal/customers/cusProducts/actions/dropHeldSchedulePhases/computeHeldSchedulePhases.js";

const PHASE_TWO_START = 1_792_600_000;

const row = ({
	id,
	status,
	subscriptionIds = [],
	scheduledIds = [],
	endedAt = null,
}: {
	id: string;
	status: CusProductStatus;
	subscriptionIds?: string[];
	scheduledIds?: string[];
	endedAt?: number | null;
}) => ({
	id,
	status,
	subscription_ids: subscriptionIds,
	scheduled_ids: scheduledIds,
	ended_at: endedAt,
	canceled: false,
});

const customerWith = (rows: ReturnType<typeof row>[]) =>
	({ customer_products: rows }) as unknown as FullCustomer;

const schedule = ({
	subscription,
	releasedSubscription = null,
}: {
	subscription: string | null;
	releasedSubscription?: string | null;
}) =>
	({
		id: "sub_sched_1",
		subscription,
		released_subscription: releasedSubscription,
		phases: [
			{ start_date: PHASE_TWO_START - 1_000_000, end_date: PHASE_TWO_START },
			{ start_date: PHASE_TWO_START, end_date: PHASE_TWO_START + 1_000_000 },
		],
	}) as unknown as Stripe.SubscriptionSchedule;

describe("computeHeldSchedulePhases", () => {
	test("splits held scheduled rows from live rows ending on a phase boundary", () => {
		const held = computeHeldSchedulePhases({
			fullCustomer: customerWith([
				row({
					id: "live",
					status: CusProductStatus.Active,
					subscriptionIds: ["sub_1"],
					endedAt: PHASE_TWO_START * 1000,
				}),
				row({
					id: "held",
					status: CusProductStatus.Scheduled,
					subscriptionIds: ["sub_1"],
					scheduledIds: ["sub_sched_1"],
				}),
				row({
					id: "other",
					status: CusProductStatus.Active,
					subscriptionIds: ["sub_2"],
					endedAt: PHASE_TWO_START * 1000,
				}),
			]),
			schedule: schedule({ subscription: "sub_1" }),
		});

		expect(held.heldRows.map((r) => r.id)).toEqual(["held"]);
		expect(held.phaseEndRows.map((r) => r.id)).toEqual(["live"]);
	});

	test("a released schedule resolves its subscription from released_subscription", () => {
		const held = computeHeldSchedulePhases({
			fullCustomer: customerWith([
				row({
					id: "live",
					status: CusProductStatus.Active,
					subscriptionIds: ["sub_1"],
					endedAt: PHASE_TWO_START * 1000,
				}),
			]),
			schedule: schedule({ subscription: null, releasedSubscription: "sub_1" }),
		});

		expect(held.phaseEndRows.map((r) => r.id)).toEqual(["live"]);
	});
});

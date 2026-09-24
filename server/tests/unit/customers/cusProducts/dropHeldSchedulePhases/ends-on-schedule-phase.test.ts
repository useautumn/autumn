/**
 * endsOnSchedulePhase
 *
 * Only an end date that sits on one of the released schedule's phase
 * boundaries is stale. A canceling plan, a scheduled row, or an add-on whose
 * ends_at was set for its own reasons keeps its date.
 */

import { describe, expect, test } from "bun:test";
import { CusProductStatus, type FullCusProduct } from "@autumn/shared";
import type Stripe from "stripe";
import { endsOnSchedulePhase } from "@/internal/customers/cusProducts/actions/dropHeldSchedulePhases/endsOnSchedulePhase.js";

const PHASE_ONE_START = 1_790_000_000;
const PHASE_TWO_START = 1_792_600_000;
const PHASE_TWO_END = 1_795_200_000;

const schedule = {
	phases: [
		{ start_date: PHASE_ONE_START, end_date: PHASE_TWO_START },
		{ start_date: PHASE_TWO_START, end_date: PHASE_TWO_END },
	],
} as unknown as Stripe.SubscriptionSchedule;

const customerProduct = ({
	endedAt,
	status = CusProductStatus.Active,
	canceled = false,
}: {
	endedAt: number | null;
	status?: CusProductStatus;
	canceled?: boolean;
}) => ({ ended_at: endedAt, status, canceled }) as unknown as FullCusProduct;

describe("endsOnSchedulePhase", () => {
	test("an end date on the next phase start is stale", () => {
		expect(
			endsOnSchedulePhase({
				customerProduct: customerProduct({ endedAt: PHASE_TWO_START * 1000 }),
				schedule,
			}),
		).toBe(true);
	});

	test("tolerates Stripe's second precision", () => {
		expect(
			endsOnSchedulePhase({
				customerProduct: customerProduct({
					endedAt: PHASE_TWO_START * 1000 + 400,
				}),
				schedule,
			}),
		).toBe(true);
	});

	test("an end date the schedule never had is kept", () => {
		expect(
			endsOnSchedulePhase({
				customerProduct: customerProduct({
					endedAt: PHASE_TWO_START * 1000 + 86_400_000,
				}),
				schedule,
			}),
		).toBe(false);
	});

	test("a canceling plan keeps its end date", () => {
		expect(
			endsOnSchedulePhase({
				customerProduct: customerProduct({
					endedAt: PHASE_TWO_START * 1000,
					canceled: true,
				}),
				schedule,
			}),
		).toBe(false);
	});

	test("a scheduled row is not a phase end", () => {
		expect(
			endsOnSchedulePhase({
				customerProduct: customerProduct({
					endedAt: PHASE_TWO_END * 1000,
					status: CusProductStatus.Scheduled,
				}),
				schedule,
			}),
		).toBe(false);
	});

	test("no end date means nothing to clear", () => {
		expect(
			endsOnSchedulePhase({
				customerProduct: customerProduct({ endedAt: null }),
				schedule,
			}),
		).toBe(false);
	});
});

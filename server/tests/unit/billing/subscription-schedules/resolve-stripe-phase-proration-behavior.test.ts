import { describe, expect, test } from "bun:test";
import type { PhaseProrationBehavior } from "@autumn/shared";
import type { SchedulePhaseProration } from "@/internal/billing/v2/providers/stripe/setup/resolveSchedulePhaseProrations";
import { phaseProrationBehaviorToStripe } from "@/internal/billing/v2/providers/stripe/utils/subscriptionSchedules/phaseProrationBehaviorToStripe";
import { resolveStripePhaseProrationBehavior } from "@/internal/billing/v2/providers/stripe/utils/subscriptionSchedules/resolveStripePhaseProrationBehavior";
import type { SchedulePhasePlan } from "@/internal/billing/v2/actions/setPlans/types/schedulePhasePlan";
import { carrySavedProrationBehaviors } from "@/internal/billing/v2/actions/setPlans/utils/carrySavedProrationBehaviors";

const PHASE_START_MS = Date.UTC(2027, 2, 1);

const phaseProration = ({
	startsAt = PHASE_START_MS,
	prorationBehavior,
}: {
	startsAt?: number;
	prorationBehavior: PhaseProrationBehavior;
}): SchedulePhaseProration => ({ startsAt, prorationBehavior });

const resolve = ({
	phaseProrations = [],
	isBillingCycleAnchorResetPhase = false,
	changesCustomerProducts = true,
	invoicesPhaseStart = true,
}: {
	phaseProrations?: SchedulePhaseProration[];
	isBillingCycleAnchorResetPhase?: boolean;
	changesCustomerProducts?: boolean;
	invoicesPhaseStart?: boolean;
}) =>
	resolveStripePhaseProrationBehavior({
		phaseProrations,
		phaseStartMs: PHASE_START_MS,
		isBillingCycleAnchorResetPhase,
		changesCustomerProducts,
		invoicesPhaseStart,
	});

describe("phaseProrationBehaviorToStripe", () => {
	test("prorate_immediately invoices now, none skips proration", () => {
		expect(
			phaseProrationBehaviorToStripe({
				prorationBehavior: "prorate_immediately",
			}),
		).toBe("always_invoice");
		expect(phaseProrationBehaviorToStripe({ prorationBehavior: "none" })).toBe(
			"none",
		);
	});
});

describe("resolveStripePhaseProrationBehavior", () => {
	test("without a requested value, a reset that switches plans skips proration", () => {
		expect(resolve({ isBillingCycleAnchorResetPhase: true })).toBe("none");
	});

	test("without a requested value, a later change invoices at the phase start", () => {
		expect(resolve({})).toBe("always_invoice");
		expect(resolve({ invoicesPhaseStart: false })).toBeUndefined();
	});

	test("the schedule phase starting here overrides the default", () => {
		expect(
			resolve({
				phaseProrations: [
					phaseProration({ prorationBehavior: "prorate_immediately" }),
				],
				isBillingCycleAnchorResetPhase: true,
			}),
		).toBe("always_invoice");
		expect(
			resolve({
				phaseProrations: [phaseProration({ prorationBehavior: "none" })],
			}),
		).toBe("none");
	});

	test("matches the phase start to the second, and ignores other phases", () => {
		expect(
			resolve({
				phaseProrations: [
					phaseProration({
						startsAt: PHASE_START_MS + 400,
						prorationBehavior: "none",
					}),
				],
			}),
		).toBe("none");
		expect(
			resolve({
				phaseProrations: [
					phaseProration({
						startsAt: PHASE_START_MS - 1000,
						prorationBehavior: "none",
					}),
				],
			}),
		).toBe("always_invoice");
	});
});

describe("carrySavedProrationBehaviors", () => {
	test("a phase that names none keeps its saved value; an explicit value or null wins", () => {
		const savedPhases: SchedulePhasePlan[] = [1000, 2000, 3000].map(
			(startsAt) => ({
				startsAt,
				customerProductIds: [],
				prorationBehavior: "none",
			}),
		);

		const carried = carrySavedProrationBehaviors({
			phases: [
				{ startsAt: 1000, customerProductIds: [] },
				{ startsAt: 2000, customerProductIds: [], prorationBehavior: null },
				{
					startsAt: 3000,
					customerProductIds: [],
					prorationBehavior: "prorate_immediately",
				},
				{ startsAt: 4000, customerProductIds: [] },
			],
			savedPhases,
		});

		expect(carried.map((phase) => phase.prorationBehavior)).toEqual([
			"none",
			null,
			"prorate_immediately",
			null,
		]);
	});
});

import { describe, expect, test } from "bun:test";
import type { FullCusProduct, PhaseProrationBehavior } from "@autumn/shared";
import { phaseProrationBehaviorToStripe } from "@/internal/billing/v2/providers/stripe/utils/subscriptionSchedules/phaseProrationBehaviorToStripe";
import { resolveStripePhaseProrationBehavior } from "@/internal/billing/v2/providers/stripe/utils/subscriptionSchedules/resolveStripePhaseProrationBehavior";

const PHASE_START_MS = Date.UTC(2027, 2, 1);

const customerProductStartingAt = ({
	startsAt,
	prorationBehavior = null,
}: {
	startsAt: number;
	prorationBehavior?: PhaseProrationBehavior | null;
}) =>
	({
		starts_at: startsAt,
		phase_proration_behavior: prorationBehavior,
	}) as FullCusProduct;

const resolve = ({
	phaseCustomerProducts,
	isBillingCycleAnchorResetPhase = false,
	changesCustomerProducts = true,
	invoicesPhaseStart = true,
}: {
	phaseCustomerProducts: FullCusProduct[];
	isBillingCycleAnchorResetPhase?: boolean;
	changesCustomerProducts?: boolean;
	invoicesPhaseStart?: boolean;
}) =>
	resolveStripePhaseProrationBehavior({
		phaseCustomerProducts,
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
		expect(
			resolve({
				phaseCustomerProducts: [
					customerProductStartingAt({ startsAt: PHASE_START_MS }),
				],
				isBillingCycleAnchorResetPhase: true,
			}),
		).toBe("none");
	});

	test("without a requested value, a later change invoices at the phase start", () => {
		expect(
			resolve({
				phaseCustomerProducts: [
					customerProductStartingAt({ startsAt: PHASE_START_MS }),
				],
			}),
		).toBe("always_invoice");
		expect(
			resolve({ phaseCustomerProducts: [], invoicesPhaseStart: false }),
		).toBeUndefined();
	});

	test("a plan starting with the phase overrides the default", () => {
		expect(
			resolve({
				phaseCustomerProducts: [
					customerProductStartingAt({
						startsAt: PHASE_START_MS,
						prorationBehavior: "prorate_immediately",
					}),
				],
				isBillingCycleAnchorResetPhase: true,
			}),
		).toBe("always_invoice");
		expect(
			resolve({
				phaseCustomerProducts: [
					customerProductStartingAt({
						startsAt: PHASE_START_MS,
						prorationBehavior: "none",
					}),
				],
			}),
		).toBe("none");
	});

	test("a plan carried in from an earlier phase does not set this phase's proration", () => {
		expect(
			resolve({
				phaseCustomerProducts: [
					customerProductStartingAt({
						startsAt: PHASE_START_MS - 1000,
						prorationBehavior: "none",
					}),
				],
			}),
		).toBe("always_invoice");
	});
});

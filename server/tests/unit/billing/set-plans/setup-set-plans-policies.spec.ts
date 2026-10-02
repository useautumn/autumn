import { expect, test } from "bun:test";
import {
	type CreateScheduleBillingContext,
	type FreeTrial,
	ms,
} from "@autumn/shared";
import { setupSetPlansPolicies } from "@/internal/billing/v2/actions/setPlans/setup/setupSetPlansPolicies";

const billingContextWith = (
	overrides: Partial<CreateScheduleBillingContext>,
): CreateScheduleBillingContext =>
	({
		currentEpochMs: 0,
		immediatePhase: { starts_at: 0, plans: [] },
		...overrides,
	}) as unknown as CreateScheduleBillingContext;

test("a requested trial recreates live rows so every plan starts it; otherwise live rows carry", () => {
	const withTrial = billingContextWith({
		trialContext: {
			trialEndsAt: 1_790_000_000_000,
			customFreeTrial: { length: 14 } as FreeTrial,
			appliesToBilling: true,
			cardRequired: true,
		},
	});

	expect(
		setupSetPlansPolicies({ billingContext: withTrial, params: {} }).liveRows,
	).toBe("recreate");
	expect(
		setupSetPlansPolicies({
			billingContext: billingContextWith({}),
			params: {},
		}).liveRows,
	).toBe("carry");
});

test("a future first phase ends undeclared live plans now, even when asked to retain them", () => {
	const currentEpochMs = 1_800_000_000_000;
	const startingAt = (startsAt: number) =>
		billingContextWith({
			currentEpochMs,
			immediatePhase: { starts_at: startsAt, plans: [] },
		});

	expect(
		setupSetPlansPolicies({
			billingContext: startingAt(currentEpochMs + ms.days(7)),
			params: { undeclared_plans: "retain" },
		}).undeclared,
	).toBe("end");
	expect(
		setupSetPlansPolicies({
			billingContext: startingAt(currentEpochMs),
			params: { undeclared_plans: "retain" },
		}).undeclared,
	).toBe("retain");
});

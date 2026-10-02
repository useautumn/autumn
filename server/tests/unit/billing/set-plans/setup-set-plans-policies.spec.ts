import { expect, test } from "bun:test";
import type { CreateScheduleBillingContext, FreeTrial } from "@autumn/shared";
import { setupSetPlansPolicies } from "@/internal/billing/v2/actions/setPlans/setup/setupSetPlansPolicies";

const billingContextWith = (
	overrides: Partial<CreateScheduleBillingContext>,
): CreateScheduleBillingContext =>
	({ ...overrides }) as unknown as CreateScheduleBillingContext;

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

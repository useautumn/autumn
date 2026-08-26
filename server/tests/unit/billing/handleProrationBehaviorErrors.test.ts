import { describe, expect, test } from "bun:test";
import type { BillingContext, BillingPlan } from "@autumn/shared";
import { handleProrationBehaviorErrors } from "@/internal/billing/v2/common/errors/handleBillingBehaviorErrors";

const context = (overrides: Partial<BillingContext> = {}) =>
	({
		requestedProrationBehavior: "none",
		requestedBillingCycleAnchor: undefined,
		currentCustomerProducts: [],
		...overrides,
	}) as unknown as BillingContext;

const plan = (stripe: Record<string, unknown>) =>
	({ stripe }) as unknown as BillingPlan;

describe("handleProrationBehaviorErrors", () => {
	test("'none' on a brand-new subscription is a no-op, not an error", () => {
		expect(() =>
			handleProrationBehaviorErrors({
				billingContext: context(),
				billingPlan: plan({ subscriptionAction: { type: "create" } }),
			}),
		).not.toThrow();
	});

	test("'none' still rejects when an update would charge", () => {
		expect(() =>
			handleProrationBehaviorErrors({
				billingContext: context(),
				billingPlan: plan({
					invoiceAction: { addLineParams: { lines: [{}] } },
				}),
			}),
		).toThrow("Cannot set proration_behavior");
	});

	test("other proration behaviors pass through untouched", () => {
		expect(() =>
			handleProrationBehaviorErrors({
				billingContext: context({
					requestedProrationBehavior: "prorate_immediately",
				} as never),
				billingPlan: plan({ subscriptionAction: { type: "create" } }),
			}),
		).not.toThrow();
	});
});

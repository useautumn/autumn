import { catalog } from "../../../src/grading/expectations/catalogExpectations.ts";
import type { Expectation } from "../../../src/grading/types/expectation.ts";

/**
 * Shared grading for the graceful-overage twins (FireCrawl pattern): no
 * priced overage anywhere; enterprise gets overage via CONTROLS —
 * overage_allowed enables it, a spend limit caps it at 10%, skip billing
 * keeps it un-invoiced. The standard-plan spec doubles as the negative
 * anchor: it must keep hard-stopping (no overage item, no controls granting
 * overage).
 */
export const gracefulOverageExpectations = (): Expectation[] =>
	catalog({
		features: {
			"credits (credit system)": { type: "credit_system", granted: true },
		},
		exactPlans: false,
		plans: {
			"standard hard-stops: allowance only, no overage item": {
				price: { amount: 99, interval: "month" },
				items: [{ included: 100000, reset: { interval: "month" } }],
			},
			"enterprise with controls-based graceful overage": {
				price: { amount: 30000, interval: "year" },
				items: [{ included: 5000000, reset: { interval: "month" } }],
				billing_controls: {
					overage_allowed: [{ enabled: true }],
					spend_limits: [
						{
							enabled: true,
							limit_type: "usage_percentage",
							overage_limit: 10,
						},
					],
				},
			},
		},
	});

export const gracefulOverageGolden =
	(): string => `import { atmn, feature, plan } from "atmn";

export default atmn({
	features: [
		feature({
			featureId: "scrapes",
			name: "Scrapes",
			type: "metered",
			consumable: true,
		}),
		feature({
			featureId: "credits",
			name: "Credits",
			type: "credit_system",
			creditSchema: [{ meteredFeatureId: "scrapes", creditCost: 1 }],
		}),
	],
	plans: [
		plan({
			planId: "standard",
			name: "Standard",
			price: { amount: 99, interval: "month" },
			items: [
				{
					featureId: "credits",
					included: 100000,
					reset: { interval: "month" },
				},
			],
		}),
		plan({
			planId: "enterprise",
			name: "Enterprise",
			price: { amount: 30000, interval: "year" },
			items: [
				{
					featureId: "credits",
					included: 5000000,
					reset: { interval: "month" },
				},
			],
			billingControls: {
				overageAllowed: [{ featureId: "credits", enabled: true }],
				spendLimits: [
					{
						featureId: "credits",
						enabled: true,
						skipOverageBilling: true,
						limitType: "usage_percentage",
						overageLimit: 10,
					},
				],
			},
		}),
	],
});
`;

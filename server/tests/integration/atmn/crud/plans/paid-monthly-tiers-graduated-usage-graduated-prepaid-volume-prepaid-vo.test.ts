/**
 * atmn crud/plans — paid [monthly] [tiers: graduated usage, graduated prepaid, volume prepaid]; volume usage is a lint error, asserted at lint
 *
 * One line of plans/atmn-v3/07_tests.md. [a, b] is a matrix looped INSIDE this file.
 * volume × usage_based is rejected by lint, not push — covered under scenarios/lint, not here.
 */

import { expect, test } from "bun:test";
import {
	configBody,
	everyFeatureType,
	paidMonthly,
} from "@tests/utils/atmnUtils/baseConfigs.js";
import { expectRoundTrip } from "@tests/utils/atmnUtils/expectRoundTrip.js";
import { initAtmnScenario } from "@tests/utils/atmnUtils/initAtmnScenario.js";
import { s } from "@tests/utils/testInitUtils/initScenario.js";
import { uniqueTestId } from "../../../catalog-v2/utils/uniqueTestId.js";

const TIER_CASES = [
	{
		label: "graduated usage",
		tierBehavior: "graduated",
		billingMethod: "usage_based",
	},
	{
		label: "graduated prepaid",
		tierBehavior: "graduated",
		billingMethod: "prepaid",
	},
	{ label: "volume prepaid", tierBehavior: "volume", billingMethod: "prepaid" },
] as const;

for (const { label, tierBehavior, billingMethod } of TIER_CASES) {
	test.concurrent(`paid [monthly] [tiers: ${label}]`, async () => {
		const scenario = await initAtmnScenario({
			setup: [
				s.platform.create({
					userEmail: `${uniqueTestId("atmn")}@autumn.test`,
				}),
			],
			config: configBody({
				features: everyFeatureType,
				plans: paidMonthly({
					items: `
				{
					featureId: "messages",
					included: 100,
					reset: { interval: "month" },
					price: {
						billingMethod: "${billingMethod}",
						interval: "month",
						billingUnits: 100,
						tierBehavior: "${tierBehavior}",
						tiers: [
							{ to: 500, amount: 0.05 },
							{ to: "inf", amount: 0.02 },
						],
					},
				},`,
				}),
			}),
		});

		try {
			const { freshWire } = await expectRoundTrip({ scenario });
			const plans = freshWire.plans as Array<Record<string, unknown>>;
			const pro = plans.find((plan) => plan.plan_id === "pro");
			const items = pro?.items as Array<Record<string, unknown>>;
			const item = items.find((entry) => entry.feature_id === "messages");
			expect(item?.price).toEqual(
				expect.objectContaining({
					tier_behavior: tierBehavior,
					billing_method: billingMethod,
				}),
			);
		} finally {
			scenario.cleanup();
		}
	});
}

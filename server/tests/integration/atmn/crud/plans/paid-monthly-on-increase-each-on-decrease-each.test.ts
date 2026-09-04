/**
 * atmn crud/plans — paid [monthly] [on_increase: each] × [on_decrease: each]
 *
 * One line of plans/atmn-v3/07_tests.md. [a, b] is a matrix looped INSIDE this file.
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

const ON_INCREASE = [
	"bill_immediately",
	"prorate_immediately",
	"prorate_next_cycle",
	"bill_next_cycle",
] as const;
const ON_DECREASE = [
	"prorate",
	"prorate_immediately",
	"prorate_next_cycle",
	"none",
	"no_prorations",
] as const;

for (const onIncrease of ON_INCREASE) {
	for (const onDecrease of ON_DECREASE) {
		test.concurrent(
			`paid [monthly] [on_increase: ${onIncrease}] × [on_decrease: ${onDecrease}]`,
			async () => {
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
					featureId: "seats",
					included: 1,
					price: {
						billingMethod: "prepaid",
						interval: "month",
						amount: 10,
						billingUnits: 1,
					},
					proration: { onIncrease: "${onIncrease}", onDecrease: "${onDecrease}" },
				},`,
						}),
					}),
				});

				try {
					const { freshWire } = await expectRoundTrip({ scenario });
					const plans = freshWire.plans as Array<Record<string, unknown>>;
					const pro = plans.find((plan) => plan.plan_id === "pro");
					const items = pro?.items as Array<Record<string, unknown>>;
					const item = items.find((entry) => entry.feature_id === "seats");
					expect(item?.proration).toEqual(
						expect.objectContaining({
							on_increase: onIncrease,
							on_decrease: onDecrease,
						}),
					);
				} finally {
					scenario.cleanup();
				}
			},
		);
	}
}

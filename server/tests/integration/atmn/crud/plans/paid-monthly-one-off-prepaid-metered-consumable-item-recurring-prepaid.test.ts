/**
 * atmn crud/plans — paid [monthly] [one off prepaid metered consumable item, recurring prepaid metered consumable item]
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

const ITEM_INTERVALS = [
	{ label: "one off", interval: "one_off" },
	{ label: "recurring", interval: "month" },
] as const;

for (const { label, interval } of ITEM_INTERVALS) {
	test.concurrent(
		`paid [monthly] [${label} prepaid metered consumable item]`,
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
					featureId: "messages",
					included: 100,
					price: {
						billingMethod: "prepaid",
						interval: "${interval}",
						amount: 5,
						billingUnits: 100,
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
					expect.objectContaining({ billing_method: "prepaid", interval }),
				);
			} finally {
				scenario.cleanup();
			}
		},
	);
}

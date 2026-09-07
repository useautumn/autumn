/**
 * atmn crud/plans — paid [monthly] [prepaid metered recurring consumable item, prepaid metered recurring non consumable item]
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

const FEATURES = [
	{ label: "consumable", featureId: "messages" },
	{ label: "non consumable", featureId: "seats" },
] as const;

for (const { label, featureId } of FEATURES) {
	test.concurrent(
		`paid [monthly] [prepaid metered recurring ${label} item]`,
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
					featureId: "${featureId}",
					included: 1,
					price: {
						billingMethod: "prepaid",
						interval: "month",
						amount: 10,
						billingUnits: 1,
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
				const item = items.find((entry) => entry.feature_id === featureId);
				expect(item?.price).toEqual(
					expect.objectContaining({
						billing_method: "prepaid",
						interval: "month",
					}),
				);
			} finally {
				scenario.cleanup();
			}
		},
	);
}

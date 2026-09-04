/**
 * atmn crud/plans — paid [yearly] [item priced monthly] (item interval ≠ plan interval)
 *
 * One line of plans/atmn-v3/07_tests.md. [a, b] is a matrix looped INSIDE this file.
 */

import { expect, test } from "bun:test";
import { configBody } from "@tests/utils/atmnUtils/baseConfigs.js";
import { expectRoundTrip } from "@tests/utils/atmnUtils/expectRoundTrip.js";
import { initAtmnScenario } from "@tests/utils/atmnUtils/initAtmnScenario.js";
import { s } from "@tests/utils/testInitUtils/initScenario.js";
import { uniqueTestId } from "../../../catalog-v2/utils/uniqueTestId.js";

test.concurrent(
	"paid [yearly] [item priced monthly] (item interval ≠ plan interval)",
	async () => {
		const scenario = await initAtmnScenario({
			setup: [
				s.platform.create({
					userEmail: `${uniqueTestId("atmn")}@autumn.test`,
				}),
			],
			config: configBody({
				plans: `
		plan({
			planId: "pro",
			name: "Pro",
			price: { amount: 490, interval: "year" },
			items: [
				{
					featureId: "api_calls",
					included: 1000,
					reset: { interval: "month" },
					price: {
						billingMethod: "usage_based",
						interval: "month",
						amount: 0.01,
						billingUnits: 1,
					},
				},
			],
		}),`,
				features: `
			feature({ featureId: "api_calls", name: "API Calls", type: "metered", consumable: true }),`,
			}),
		});

		try {
			const { freshWire } = await expectRoundTrip({ scenario });
			const plans = freshWire.plans as Array<Record<string, unknown>>;
			const pro = plans.find((plan) => plan.plan_id === "pro");
			const items = pro?.items as Array<Record<string, unknown>>;
			const item = items.find((entry) => entry.feature_id === "api_calls");
			expect(pro?.price).toEqual(expect.objectContaining({ interval: "year" }));
			expect(item?.price).toEqual(
				expect.objectContaining({ interval: "month" }),
			);
		} finally {
			scenario.cleanup();
		}
	},
);

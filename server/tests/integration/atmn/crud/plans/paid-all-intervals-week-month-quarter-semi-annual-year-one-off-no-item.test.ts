/**
 * atmn crud/plans — paid [all intervals: week, month, quarter, semi_annual, year, one_off] no items
 *
 * One line of plans/atmn-v3/07_tests.md. [a, b] is a matrix looped INSIDE this file.
 */

import { expect, test } from "bun:test";
import { configBody } from "@tests/utils/atmnUtils/baseConfigs.js";
import { expectRoundTrip } from "@tests/utils/atmnUtils/expectRoundTrip.js";
import { initAtmnScenario } from "@tests/utils/atmnUtils/initAtmnScenario.js";
import { s } from "@tests/utils/testInitUtils/initScenario.js";
import { uniqueTestId } from "../../../catalog-v2/utils/uniqueTestId.js";

const PLAN_INTERVALS = [
	"week",
	"month",
	"quarter",
	"semi_annual",
	"year",
	"one_off",
] as const;

for (const interval of PLAN_INTERVALS) {
	test.concurrent(`paid [${interval}] no items`, async () => {
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
			price: { amount: 49, interval: "${interval}" },
			items: [],
		}),`,
			}),
		});

		try {
			const { freshWire } = await expectRoundTrip({ scenario });
			const plans = freshWire.plans as Array<Record<string, unknown>>;
			const pro = plans.find((plan) => plan.plan_id === "pro");
			expect(pro?.price).toEqual(expect.objectContaining({ interval }));
		} finally {
			scenario.cleanup();
		}
	});
}

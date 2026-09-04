/**
 * atmn crud/plans — paid [monthly] [interval_count 1, 3]
 *
 * One line of plans/atmn-v3/07_tests.md. [a, b] is a matrix looped INSIDE this file.
 */

import { expect, test } from "bun:test";
import { configBody } from "@tests/utils/atmnUtils/baseConfigs.js";
import { expectRoundTrip } from "@tests/utils/atmnUtils/expectRoundTrip.js";
import { initAtmnScenario } from "@tests/utils/atmnUtils/initAtmnScenario.js";
import { s } from "@tests/utils/testInitUtils/initScenario.js";
import { uniqueTestId } from "../../../catalog-v2/utils/uniqueTestId.js";

const INTERVAL_COUNTS = [1, 3] as const;

for (const intervalCount of INTERVAL_COUNTS) {
	test.concurrent(
		`paid [monthly] [interval_count ${intervalCount}]`,
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
			price: { amount: 49, interval: "month", intervalCount: ${intervalCount} },
			items: [],
		}),`,
				}),
			});

			try {
				const { freshWire } = await expectRoundTrip({ scenario });
				const plans = freshWire.plans as Array<Record<string, unknown>>;
				const pro = plans.find((plan) => plan.plan_id === "pro");
				expect(pro?.price).toEqual(
					expect.objectContaining({ interval_count: intervalCount }),
				);
			} finally {
				scenario.cleanup();
			}
		},
	);
}

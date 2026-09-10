/**
 * atmn crud/plans — paid [monthly] [free trial: n days] [card required, not required]
 *
 * One line of plans/atmn-v3/07_tests.md. [a, b] is a matrix looped INSIDE this file.
 */

import { expect, test } from "bun:test";
import { configBody, paidMonthly } from "@tests/utils/atmnUtils/baseConfigs.js";
import { expectRoundTrip } from "@tests/utils/atmnUtils/expectRoundTrip.js";
import { initAtmnScenario } from "@tests/utils/atmnUtils/initAtmnScenario.js";
import { s } from "@tests/utils/testInitUtils/initScenario.js";
import { uniqueTestId } from "../../../catalog-v2/utils/uniqueTestId.js";

const CARD_REQUIRED = [true, false] as const;

for (const cardRequired of CARD_REQUIRED) {
	test.concurrent(
		`paid [monthly] [free trial: 14 days] [card required: ${cardRequired}]`,
		async () => {
			const scenario = await initAtmnScenario({
				setup: [
					s.platform.create({
						userEmail: `${uniqueTestId("atmn")}@autumn.test`,
					}),
				],
				config: configBody({
					plans: paidMonthly({
						extra: `
				freeTrial: { durationLength: 14, durationType: "day", cardRequired: ${cardRequired}, onEnd: "bill" },`,
					}),
				}),
			});

			try {
				const { freshWire } = await expectRoundTrip({ scenario });
				const plans = freshWire.plans as Array<Record<string, unknown>>;
				const pro = plans.find((plan) => plan.plan_id === "pro");
				// A pull elides the spec defaults: `cardRequired: false` and
				// `onEnd: "bill"` read the same when absent.
				expect(pro?.free_trial).toEqual({
					duration_length: 14,
					duration_type: "day",
					...(cardRequired ? { card_required: true } : {}),
				});
				const catalog = (await scenario.client.get({})) as {
					plans: Array<{ id: string; freeTrial?: Record<string, unknown> }>;
				};
				expect(
					catalog.plans.find((plan) => plan.id === "pro")?.freeTrial,
				).toEqual(
					expect.objectContaining({
						durationLength: 14,
						durationType: "day",
						cardRequired,
					}),
				);
			} finally {
				scenario.cleanup();
			}
		},
	);
}

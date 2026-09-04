/**
 * atmn crud/plans — add-on [one_off, recurring]
 *
 * One line of plans/atmn-v3/07_tests.md. [a, b] is a matrix looped INSIDE this file.
 */

import { expect, test } from "bun:test";
import { configBody } from "@tests/utils/atmnUtils/baseConfigs.js";
import { expectRoundTrip } from "@tests/utils/atmnUtils/expectRoundTrip.js";
import { initAtmnScenario } from "@tests/utils/atmnUtils/initAtmnScenario.js";
import { s } from "@tests/utils/testInitUtils/initScenario.js";
import { uniqueTestId } from "../../../catalog-v2/utils/uniqueTestId.js";

const ADD_ON_INTERVALS = [
	{ label: "one_off", interval: "one_off" },
	{ label: "recurring", interval: "month" },
] as const;

for (const { label, interval } of ADD_ON_INTERVALS) {
	test.concurrent(`add-on [${label}]`, async () => {
		const scenario = await initAtmnScenario({
			setup: [
				s.platform.create({
					userEmail: `${uniqueTestId("atmn")}@autumn.test`,
				}),
			],
			config: configBody({
				plans: `
		plan({
			planId: "addon",
			name: "Addon",
			addOn: true,
			price: { amount: 10, interval: "${interval}" },
			items: [],
		}),`,
			}),
		});

		try {
			const { freshWire } = await expectRoundTrip({ scenario });
			const plans = freshWire.plans as Array<Record<string, unknown>>;
			const addon = plans.find((plan) => plan.plan_id === "addon");
			expect(addon).toEqual(
				expect.objectContaining({
					add_on: true,
					price: expect.objectContaining({ interval }),
				}),
			);
		} finally {
			scenario.cleanup();
		}
	});
}

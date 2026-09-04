/**
 * atmn crud/plans — paid [monthly] [rollover: max, max_percentage] [expiry: month n, forever]
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

const ROLLOVER_KINDS = [
	{ label: "max", source: "max: 50," },
	{ label: "max_percentage", source: "maxPercentage: 50," },
] as const;
const EXPIRIES = [
	{
		label: "month n",
		source: 'expiryDurationType: "month", expiryDurationLength: 3,',
	},
	{ label: "forever", source: 'expiryDurationType: "forever",' },
] as const;

for (const rollover of ROLLOVER_KINDS) {
	for (const expiry of EXPIRIES) {
		test.concurrent(
			`paid [monthly] [rollover: ${rollover.label}] [expiry: ${expiry.label}]`,
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
					reset: { interval: "month" },
					rollover: { ${rollover.source} ${expiry.source} },
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
					const expected: Record<string, unknown> = {
						expiry_duration_type:
							expiry.label === "forever" ? "forever" : "month",
					};
					if (rollover.label === "max") expected.max = 50;
					else expected.max_percentage = 50;
					if (expiry.label === "month n") expected.expiry_duration_length = 3;
					expect(item?.rollover).toEqual(expect.objectContaining(expected));
				} finally {
					scenario.cleanup();
				}
			},
		);
	}
}

/**
 * atmn crud/plans — paid [monthly] [unlimited item, pooled item, per-entity item (entity_feature_id)]
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

test.concurrent("paid [monthly] [unlimited item]", async () => {
	const scenario = await initAtmnScenario({
		setup: [
			s.platform.create({ userEmail: `${uniqueTestId("atmn")}@autumn.test` }),
		],
		config: configBody({
			features: everyFeatureType,
			plans: paidMonthly({
				items: `
				{ featureId: "messages", unlimited: true },`,
			}),
		}),
	});

	try {
		const { freshWire } = await expectRoundTrip({ scenario });
		const plans = freshWire.plans as Array<Record<string, unknown>>;
		const pro = plans.find((plan) => plan.plan_id === "pro");
		const items = pro?.items as Array<Record<string, unknown>>;
		const item = items.find((entry) => entry.feature_id === "messages");
		expect(item).toEqual(expect.objectContaining({ unlimited: true }));
	} finally {
		scenario.cleanup();
	}
});

test.concurrent("paid [monthly] [pooled item]", async () => {
	const scenario = await initAtmnScenario({
		setup: [
			s.platform.create({ userEmail: `${uniqueTestId("atmn")}@autumn.test` }),
		],
		config: configBody({
			features: everyFeatureType,
			plans: paidMonthly({
				items: `
				{ featureId: "seats", included: 5, pooled: true },`,
			}),
		}),
	});

	try {
		const { freshWire } = await expectRoundTrip({ scenario });
		const plans = freshWire.plans as Array<Record<string, unknown>>;
		const pro = plans.find((plan) => plan.plan_id === "pro");
		const items = pro?.items as Array<Record<string, unknown>>;
		const item = items.find((entry) => entry.feature_id === "seats");
		expect(item).toEqual(expect.objectContaining({ pooled: true }));
	} finally {
		scenario.cleanup();
	}
});

// entityFeatureId is x-internal in the openapi spec, so it is stripped from
// the CLI's public builder types; it still executes fine since the config
// source is never typechecked, only run.
test.concurrent(
	"paid [monthly] [per-entity item (entity_feature_id)]",
	async () => {
		const scenario = await initAtmnScenario({
			setup: [
				s.platform.create({ userEmail: `${uniqueTestId("atmn")}@autumn.test` }),
			],
			config: configBody({
				features: everyFeatureType,
				plans: paidMonthly({
					items: `
				{ featureId: "seats", included: 1 },
				{
					featureId: "messages",
					included: 100,
					reset: { interval: "month" },
					entityFeatureId: "seats",
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
			expect(item).toEqual(
				expect.objectContaining({ entity_feature_id: "seats" }),
			);
		} finally {
			scenario.cleanup();
		}
	},
);

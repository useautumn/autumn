/**
 * atmn crud/plans — paid [monthly] [free items, all types of features]
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

test.concurrent(
	"paid [monthly] [free items, all types of features]",
	async () => {
		const scenario = await initAtmnScenario({
			setup: [
				s.platform.create({ userEmail: `${uniqueTestId("atmn")}@autumn.test` }),
			],
			config: configBody({
				features: everyFeatureType,
				plans: paidMonthly({
					items: `
				{ featureId: "seats", included: 3 },
				{ featureId: "messages", included: 1000, reset: { interval: "month" } },
				{ featureId: "api_calls", included: 5000, reset: { interval: "month" } },
				{ featureId: "credits", included: 200, reset: { interval: "month" } },
				{ featureId: "ai_credits", included: 100, reset: { interval: "month" } },
				{ featureId: "sso" },
				{ featureId: "audit_log" },`,
				}),
			}),
		});

		try {
			const { freshWire } = await expectRoundTrip({ scenario });
			const plans = freshWire.plans as Array<Record<string, unknown>>;
			const pro = plans.find((plan) => plan.plan_id === "pro");
			const items = pro?.items as Array<Record<string, unknown>>;
			const featureIds = items.map((item) => item.feature_id).sort();
			expect(featureIds).toEqual(
				[
					"ai_credits",
					"api_calls",
					"audit_log",
					"credits",
					"messages",
					"seats",
					"sso",
				].sort(),
			);
			for (const item of items) expect(item.price).toBeFalsy();
		} finally {
			scenario.cleanup();
		}
	},
);

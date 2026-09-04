/**
 * atmn crud/plans — [group, description, metadata, config.ignorePastDue, each billingControls key]
 *
 * One line of plans/atmn-v3/07_tests.md. [a, b] is a matrix looped INSIDE this file.
 */

import { expect, test } from "bun:test";
import {
	configBody,
	everyFeatureType,
} from "@tests/utils/atmnUtils/baseConfigs.js";
import { expectRoundTrip } from "@tests/utils/atmnUtils/expectRoundTrip.js";
import { initAtmnScenario } from "@tests/utils/atmnUtils/initAtmnScenario.js";
import { s } from "@tests/utils/testInitUtils/initScenario.js";
import { uniqueTestId } from "../../../catalog-v2/utils/uniqueTestId.js";

test.concurrent(
	"[group, description, metadata, config.ignorePastDue, each billingControls key]",
	async () => {
		const scenario = await initAtmnScenario({
			setup: [
				s.platform.create({
					userEmail: `${uniqueTestId("atmn")}@autumn.test`,
				}),
			],
			config: configBody({
				features: everyFeatureType,
				plans: `
		plan({
			planId: "pro",
			name: "Pro",
			price: { amount: 49, interval: "month" },
			group: "core",
			description: "For growing teams.",
			metadata: { tier: "pro", region: "us" },
			config: { ignorePastDue: true },
			billingControls: {
				autoTopups: [
					{ featureId: "credits", enabled: true, threshold: 10, quantity: 100 },
				],
				spendLimits: [
					{
						featureId: "api_calls",
						enabled: true,
						limitType: "absolute",
						overageLimit: 500,
					},
				],
				usageLimits: [
					{
						featureId: "api_calls",
						enabled: true,
						limit: 1000,
						interval: "month",
					},
				],
				usageAlerts: [
					{
						featureId: "api_calls",
						enabled: true,
						threshold: 80,
						thresholdType: "usage_percentage",
						name: "80% of overage cap",
					},
				],
				overageAllowed: [{ featureId: "api_calls", enabled: true }],
			},
			items: [],
		}),`,
			}),
		});

		try {
			const { freshWire } = await expectRoundTrip({ scenario });
			const plans = freshWire.plans as Array<Record<string, unknown>>;
			const pro = plans.find((plan) => plan.plan_id === "pro");
			expect(pro).toEqual(
				expect.objectContaining({
					group: "core",
					description: "For growing teams.",
					metadata: { tier: "pro", region: "us" },
					config: expect.objectContaining({ ignore_past_due: true }),
					billing_controls: expect.objectContaining({
						auto_topups: expect.any(Array),
						spend_limits: expect.any(Array),
						usage_limits: expect.any(Array),
						usage_alerts: expect.any(Array),
						overage_allowed: expect.any(Array),
					}),
				}),
			);
		} finally {
			scenario.cleanup();
		}
	},
);

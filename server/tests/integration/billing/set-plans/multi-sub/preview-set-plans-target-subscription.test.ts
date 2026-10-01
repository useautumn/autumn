import { expect, test } from "bun:test";
import chalk from "chalk";
import { initMultiSubScenario } from "./multiSubScenario";

test.concurrent(
	`${chalk.yellowBright("set-plans multi-sub preview: a targeted preview notes the other subscription is unaffected")}`,
	async () => {
		const customerId = "set-plans-multi-sub-preview";
		const { autumnV2_4, subscriptionA, plans } = await initMultiSubScenario({
			customerId,
		});

		const preview = await autumnV2_4.billing.previewSetPlans({
			customer_id: customerId,
			stripe_subscription_id: subscriptionA,
			phases: [{ starts_at: "now", plans: [{ plan_id: plans.premium.id }] }],
		});

		expect(preview.warnings).toContainEqual({
			type: "other_subscriptions_unaffected",
			severity: "info",
			message: "Plans on 1 other subscription aren't affected.",
		});
		expect(
			preview.processor_changes.every(
				(processorChange) =>
					processorChange.type !== "subscription" ||
					processorChange.id === null ||
					processorChange.id === subscriptionA,
			),
		).toBe(true);
	},
);

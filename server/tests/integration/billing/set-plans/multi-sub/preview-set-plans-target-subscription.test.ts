import { expect, test } from "bun:test";
import chalk from "chalk";
import { initMultiSubScenario } from "./multiSubScenario";

test.concurrent(
	`${chalk.yellowBright("set-plans multi-sub preview: a targeted preview leaves the other subscription's plans out and notes them unaffected")}`,
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
		const previewPlanIds = [
			...preview.phases.flatMap((phase) => phase.plans),
			...preview.removed_phases.flatMap((phase) => phase.plans),
		].map((plan) => plan.plan_id);
		expect(previewPlanIds).not.toContain(plans.seats.id);
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

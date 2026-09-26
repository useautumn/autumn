import { expect, test } from "bun:test";
import { ms, type SetPlansPreviewPhase } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

const summarizePhase = (phase: SetPlansPreviewPhase) => ({
	plans: phase.plan_changes.map((change) => [
		change.action,
		change.subscription?.plan_id,
	]),
	granted: phase.balance_changes.map((change) => [
		change.feature_id,
		change.previous_attributes.granted,
		change.balance.granted,
	]),
	stripeItems: phase.processor_item_changes.map((change) => [
		change.action,
		change.plan_id,
		change.managed_by_autumn,
	]),
});

test.concurrent(
	`${chalk.yellowBright("preview-set-plans: reports plan, balance and Stripe changes per phase")}`,
	async () => {
		const customerId = "preview-set-plans-phases";
		const pro = products.base({
			id: "preview-set-plans-pro",
			items: [
				items.monthlyMessages({ includedUsage: 100 }),
				items.monthlyPrice({ price: 20 }),
			],
		});
		const premium = products.base({
			id: "preview-set-plans-premium",
			items: [
				items.monthlyMessages({ includedUsage: 500 }),
				items.monthlyPrice({ price: 50 }),
			],
		});

		const { autumnV2_2 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, premium] }),
			],
			actions: [s.attach({ productId: pro.id })],
		});

		const preview = await autumnV2_2.billing.previewSetPlans({
			customer_id: customerId,
			phases: [
				{ starts_at: "now" as const, plans: [{ plan_id: premium.id }] },
				{
					starts_at: Date.now() + ms.days(45),
					plans: [{ plan_id: pro.id }],
				},
			],
		});

		expect(preview.total).toBeGreaterThan(0);
		expect(preview.phases.map(summarizePhase)).toEqual([
			{
				plans: [
					["activated", premium.id],
					["expired", pro.id],
				],
				granted: [[TestFeature.Messages, 100, 500]],
				stripeItems: [
					["created", premium.id, true],
					["deleted", pro.id, true],
				],
			},
			{
				plans: [
					["scheduled", pro.id],
					["expired", premium.id],
				],
				granted: [[TestFeature.Messages, 500, 100]],
				stripeItems: [
					["created", pro.id, true],
					["deleted", premium.id, true],
				],
			},
		]);
		expect(preview.processor_changes).toEqual([
			{
				type: "subscription",
				processor: "stripe",
				id: expect.stringMatching(/^sub_/),
				action: "updated",
			},
			{
				type: "subscription_schedule",
				processor: "stripe",
				id: null,
				action: "created",
				phase_count: 2,
			},
		]);
		expect(preview.warnings).toEqual([]);
	},
);

test.concurrent(
	`${chalk.yellowBright("preview-set-plans: replacing an existing schedule releases it and warns")}`,
	async () => {
		const customerId = "preview-set-plans-replace-schedule";
		const pro = products.base({
			id: "preview-set-plans-replace-pro",
			items: [items.monthlyPrice({ price: 20 })],
		});
		const premium = products.base({
			id: "preview-set-plans-replace-premium",
			items: [items.monthlyPrice({ price: 50 })],
		});

		const { autumnV2_2 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, premium] }),
			],
			actions: [s.attach({ productId: pro.id })],
		});
		await autumnV2_2.billing.setPlans({
			customer_id: customerId,
			phases: [
				{ starts_at: "now" as const, plans: [{ plan_id: pro.id }] },
				{
					starts_at: Date.now() + ms.days(30),
					plans: [{ plan_id: premium.id }],
				},
			],
		});

		const preview = await autumnV2_2.billing.previewSetPlans({
			customer_id: customerId,
			phases: [
				{ starts_at: "now" as const, plans: [{ plan_id: pro.id }] },
				{
					starts_at: Date.now() + ms.days(60),
					plans: [{ plan_id: premium.id }],
				},
			],
		});

		expect(
			preview.processor_changes.map((change) => [change.type, change.action]),
		).toEqual([
			["subscription_schedule", "released"],
			["subscription_schedule", "created"],
		]);
		expect(preview.warnings.map((warning) => warning.type)).toEqual([
			"existing_schedule_replaced",
			"future_phase_removed",
		]);
	},
);

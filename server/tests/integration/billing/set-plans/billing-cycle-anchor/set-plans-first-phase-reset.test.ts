/** A first phase's billing_cycle_anchor 'phase_start' resets the cycle now. */

import { test } from "bun:test";
import type { ApiCustomerV5, SetPlansParamsV0Input } from "@autumn/shared";
import { expectPreviewNextCycleCorrect } from "@tests/integration/billing/utils/expectPreviewNextCycleCorrect";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { addMonths } from "date-fns";

const resetCatalog = () => ({
	pro: products.pro({
		id: "pro",
		group: "main",
		items: [items.monthlyMessages({ includedUsage: 100 })],
	}),
	premium: products.premium({
		id: "premium",
		items: [items.monthlyMessages({ includedUsage: 500 })],
	}),
});

test.concurrent(
	`${chalk.yellowBright("set-plans first phase reset: phase_start on a first phase starting now resets the cycle now")}`,
	async () => {
		const customerId = "set-plans-first-phase-reset";
		const { pro, premium } = resetCatalog();
		const { autumnV2_4, ctx, advancedTo } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, premium] }),
			],
			actions: [
				s.billing.attach({ productId: pro.id }),
				s.advanceTestClock({ days: 10 }),
			],
		});

		await autumnV2_4.billing.setPlans<SetPlansParamsV0Input>({
			customer_id: customerId,
			phases: [
				{
					starts_at: "now",
					billing_cycle_anchor: "phase_start",
					plans: [{ plan_id: premium.id }],
				},
			],
		});

		const customer = await autumnV2_4.customers.get<ApiCustomerV5>(customerId);
		await expectBalanceCorrect({
			customer,
			featureId: TestFeature.Messages,
			remaining: 500,
			planId: premium.id,
			nextResetAt: addMonths(advancedTo, 1).getTime(),
		});
		await expectStripeSubscriptionCorrect({ ctx, customerId });
	},
);

test.concurrent(
	`${chalk.yellowBright("set-plans first phase reset: the preview shows the next cycle one interval after now")}`,
	async () => {
		const customerId = "set-plans-first-phase-reset-preview";
		const { pro, premium } = resetCatalog();
		const { autumnV2_4, advancedTo } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, premium] }),
			],
			actions: [
				s.billing.attach({ productId: pro.id }),
				s.advanceTestClock({ days: 10 }),
			],
		});

		const preview = await autumnV2_4.billing.previewSetPlans({
			customer_id: customerId,
			phases: [
				{
					starts_at: "now",
					billing_cycle_anchor: "phase_start",
					plans: [{ plan_id: premium.id }],
				},
			],
		});

		expectPreviewNextCycleCorrect({
			preview,
			startsAt: addMonths(advancedTo, 1).getTime(),
			total: 50,
		});
	},
);

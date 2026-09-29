import { expect, test } from "bun:test";
import { ms } from "@autumn/shared";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test.concurrent(
	`${chalk.yellowBright("set-plans: previews and creates a two-phase schedule")}`,
	async () => {
		const customerId = "set-plans-basic";
		const pro = products.base({
			id: "set-plans-basic-pro",
			items: [
				items.monthlyMessages({ includedUsage: 100 }),
				items.monthlyPrice({ price: 20 }),
			],
		});
		const premium = products.base({
			id: "set-plans-basic-premium",
			items: [
				items.monthlyMessages({ includedUsage: 500 }),
				items.monthlyPrice({ price: 50 }),
			],
		});

		const { autumnV2_2, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, premium] }),
			],
			actions: [],
		});

		const params = {
			customer_id: customerId,
			phases: [
				{ starts_at: "now" as const, plans: [{ plan_id: pro.id }] },
				{
					starts_at: Date.now() + ms.days(30),
					plans: [{ plan_id: premium.id }],
				},
			],
		};

		const preview = await autumnV2_2.billing.previewSetPlans(params);
		expect(preview.total).toBe(20);

		const response = await autumnV2_2.billing.setPlans(params);
		expect(response.status).toBe("created");
		expect(response.phases).toHaveLength(2);

		await expectCustomerProducts({
			customerId,
			active: [pro.id],
			scheduled: [premium.id],
		});
		await expectStripeSubscriptionCorrect({ ctx, customerId });
	},
);

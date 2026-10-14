import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { createStripeSubscriptionFromProduct } from "./utils/syncTestUtils";

test.concurrent(
	`${chalk.yellowBright("sync-already-linked-repair: expire_previous repair sync replaces an already-linked product")}`,
	async () => {
		const customerId = "sync-already-linked-repair";

		const pro = products.pro({
			id: "pro",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { autumnV1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [],
		});

		const stripeSubscription = await createStripeSubscriptionFromProduct({
			ctx,
			customerId,
			productId: pro.id,
		});

		const firstSync = await autumnV1.post("/billing.sync", {
			customer_id: customerId,
			mappings: [
				{ stripe_subscription_id: stripeSubscription.id, plan_id: pro.id },
			],
		});
		expect(firstSync.results[0].success).toBe(true);

		const customerAfterFirstSync =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		expectCustomerFeatureCorrect({
			customer: customerAfterFirstSync,
			featureId: TestFeature.Messages,
			includedUsage: 100,
			balance: 100,
			usage: 0,
		});

		const repairSync = await autumnV1.post("/billing.sync", {
			customer_id: customerId,
			mappings: [
				{
					stripe_subscription_id: stripeSubscription.id,
					plan_id: pro.id,
					expire_previous: true,
					items: [
						items.monthlyMessages({ includedUsage: 200 }),
					],
				},
			],
		});
		expect(repairSync.results[0].success).toBe(true);

		const customerAfterRepair =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);

		expectCustomerFeatureCorrect({
			customer: customerAfterRepair,
			featureId: TestFeature.Messages,
			includedUsage: 200,
			balance: 200,
			usage: 0,
		});

		const activeProInstances = customerAfterRepair.products.filter(
			(p) => p.id === pro.id && p.status === "active",
		);
		expect(activeProInstances).toHaveLength(1);
	},
);

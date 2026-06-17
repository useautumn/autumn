import { expect, test } from "bun:test";
import {
	type ApiCustomerV5,
	BillingInterval,
	BillingMethod,
	ProductItemInterval,
	type UpdateSubscriptionV1ParamsInput,
} from "@autumn/shared";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test.concurrent(
	`${chalk.yellowBright("patch item filters: interval_count stays on matching side")}`,
	async () => {
		const customerId = "patch-filter-split-interval-count";
		const plan = products.base({
			id: "patch-filter-split-interval-count",
			items: [
				items.prepaidMessages({
					price: 10,
					billingUnits: 100,
					intervalCount: 3,
					priceInterval: ProductItemInterval.Year,
					priceIntervalCount: 1,
				}),
			],
		});

		const { autumnV2_2 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [plan] }),
			],
			actions: [],
		});

		await autumnV2_2.billing.attach({
			customer_id: customerId,
			plan_id: plan.id,
			feature_quantities: [
				{ feature_id: TestFeature.Messages, quantity: 300 },
			],
			redirect_mode: "if_required",
		});

		const updateParams: UpdateSubscriptionV1ParamsInput = {
			customer_id: customerId,
			plan_id: plan.id,
			customize: {
				remove_items: [
					{
						feature_id: TestFeature.Messages,
						billing_method: BillingMethod.Prepaid,
						interval: BillingInterval.Year,
						interval_count: 3,
					},
				],
				add_items: [itemsV2.monthlyWords({ included: 50 })],
			},
			redirect_mode: "if_required",
		};

		await autumnV2_2.subscriptions.update(updateParams);

		const customer = await autumnV2_2.customers.get<ApiCustomerV5>(
			customerId,
			{ skip_cache: "true" },
		);
		expectBalanceCorrect({
			customer,
			featureId: TestFeature.Messages,
			remaining: 300,
			usage: 0,
			planId: plan.id,
		});
		expectBalanceCorrect({
			customer,
			featureId: TestFeature.Words,
			remaining: 50,
			usage: 0,
			planId: plan.id,
		});
	},
);

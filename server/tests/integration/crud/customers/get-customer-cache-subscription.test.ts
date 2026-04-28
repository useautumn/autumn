import { expect, test } from "bun:test";
import {
	type ApiCustomerV5,
	ApiCustomerV5Schema,
} from "@shared/api/customers/apiCustomerV5";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

test.concurrent(`${chalk.yellowBright("get-customer: cached recurring plan with one-off usage remains subscription")}`, async () => {
	const customerId = "get-customer-mixed-recurring-oneoff-cache";
	const oneOffUsageItem = items.oneOffMessages({
		billingUnits: 100,
		price: 10,
	});
	const hobby = products.pro({
		id: "hobby",
		items: [oneOffUsageItem],
	});

	const { autumnV2_2, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [hobby] }),
		],
		actions: [s.billing.attach({ productId: hobby.id })],
	});

	await autumnV2_2.customers.get<ApiCustomerV5>(customerId, {
		keepInternalFields: true,
	});
	const cachedCustomer = await autumnV2_2.customers.get<ApiCustomerV5>(
		customerId,
		{
			keepInternalFields: true,
		},
	);

	ApiCustomerV5Schema.parse(cachedCustomer);
	const subscription = cachedCustomer.subscriptions.find(
		(subscription) => subscription.plan_id === hobby.id,
	);

	expect(subscription).toBeDefined();
	expect(subscription!.current_period_start).toBeNumber();
	expect(subscription!.current_period_end).toBeNumber();
	expect(
		cachedCustomer.purchases.find((purchase) => purchase.plan_id === hobby.id),
	).toBeUndefined();

	await expectStripeSubscriptionCorrect({ ctx, customerId });
});

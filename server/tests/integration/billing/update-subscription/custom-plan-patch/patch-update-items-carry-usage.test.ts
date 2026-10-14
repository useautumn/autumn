import { test } from "bun:test";
import type {
	ApiCustomerV5,
	UpdateSubscriptionV1ParamsInput,
} from "@autumn/shared";
import { BillingInterval, ResetInterval } from "@autumn/shared";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectNoExpiredCustomerProducts } from "@tests/integration/billing/utils/expectNoExpiredCustomerProducts";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test.concurrent(`${chalk.yellowBright("patch update items carry usage: same feature monthly replacement ignores lifetime usage")}`, async () => {
	const customerId = "patch-items-carry-usage-same-feature";
	const pro = products.pro({
		items: [
			items.monthlyMessages({ includedUsage: 100 }),
			items.lifetimeMessages({ includedUsage: 500 }),
		],
	});

	const { autumnV2, autumnV2_2, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.billing.attach({ productId: pro.id })],
	});

	await autumnV2.balances.update({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		current_balance: 50,
		interval: ResetInterval.Month,
	});
	await autumnV2.balances.update({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		current_balance: 200,
		interval: ResetInterval.OneOff,
	});

	const updateParams: UpdateSubscriptionV1ParamsInput = {
		customer_id: customerId,
		plan_id: pro.id,
		customize: {
			remove_items: [
				{
					feature_id: TestFeature.Messages,
					interval: BillingInterval.Month,
				},
			],
			add_items: [itemsV2.monthlyMessages({ included: 200 })],
		},
	};

	await autumnV2_2.subscriptions.update<UpdateSubscriptionV1ParamsInput>(
		updateParams,
	);

	const customer = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
	await expectCustomerProducts({ customer, active: [pro.id] });
	expectBalanceCorrect({
		customer,
		featureId: TestFeature.Messages,
		remaining: 350,
		usage: 350,
		planId: pro.id,
		breakdown: {
			[ResetInterval.Month]: {
				included_grant: 200,
				remaining: 150,
				usage: 50,
			},
			[ResetInterval.OneOff]: {
				included_grant: 500,
				remaining: 200,
				usage: 300,
			},
		},
	});
	await expectNoExpiredCustomerProducts({ ctx, customerId, productId: pro.id });
	await expectStripeSubscriptionCorrect({ ctx, customerId });
});

test.concurrent(`${chalk.yellowBright("patch update items carry usage: replacing messages keeps words usage unchanged")}`, async () => {
	const customerId = "patch-items-carry-usage-other-feature";
	const pro = products.pro({
		items: [
			items.monthlyMessages({ includedUsage: 100 }),
			items.monthlyWords({ includedUsage: 250 }),
		],
	});

	const { autumnV1, autumnV2_2, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.billing.attach({ productId: pro.id })],
	});

	await autumnV1.track(
		{
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 60,
		},
		{ timeout: 2000 },
	);
	await autumnV1.track(
		{
			customer_id: customerId,
			feature_id: TestFeature.Words,
			value: 80,
		},
		{ timeout: 2000 },
	);

	const updateParams: UpdateSubscriptionV1ParamsInput = {
		customer_id: customerId,
		plan_id: pro.id,
		customize: {
			remove_items: [{ feature_id: TestFeature.Messages }],
			add_items: [itemsV2.monthlyMessages({ included: 200 })],
		},
	};

	await autumnV2_2.subscriptions.update<UpdateSubscriptionV1ParamsInput>(
		updateParams,
	);

	const customer = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
	await expectCustomerProducts({ customer, active: [pro.id] });
	expectBalanceCorrect({
		customer,
		featureId: TestFeature.Messages,
		remaining: 140,
		usage: 60,
		planId: pro.id,
	});
	expectBalanceCorrect({
		customer,
		featureId: TestFeature.Words,
		remaining: 170,
		usage: 80,
		planId: pro.id,
	});
	await expectNoExpiredCustomerProducts({ ctx, customerId, productId: pro.id });
	await expectStripeSubscriptionCorrect({ ctx, customerId });
});

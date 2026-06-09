import { expect, test } from "bun:test";
import type { ApiCustomerV3, ApiCustomerV5 } from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectNoExpiredCustomerProducts } from "@tests/integration/billing/utils/expectNoExpiredCustomerProducts";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { expectFlagCorrect } from "@tests/integration/utils/expectFlagCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { runUpdatePlanMigration } from "../../utils/runUpdatePlanMigration";

test.concurrent(`${chalk.yellowBright("migrations update_plan: update price and add boolean entitlement")}`, async () => {
	const customerId = "migration-update-price";
	const pro = products.pro({ items: [] });

	const { autumnV1, autumnV2_2, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.billing.attach({ productId: pro.id })],
	});

	await runUpdatePlanMigration({
		ctx,
		migrationClient: autumnV2_2,
		migrationId: `${customerId}-mig`,
		customerId,
		filter: { customer: { plan: { plan_id: pro.id } } },
		operations: {
			customer: [
				{
					type: "update_plan",
					plan_filter: { plan_id: pro.id },
					customize: {
						price: itemsV2.monthlyPrice({ amount: 32 }),
						add_items: [itemsV2.dashboard()],
					},
				},
			],
		},
	});

	const customer = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
	await expectCustomerProducts({ customer, active: [pro.id] });
	expectFlagCorrect({
		customer,
		featureId: TestFeature.Dashboard,
		planId: pro.id,
	});
	await expectCustomerInvoiceCorrect({
		customer: await autumnV1.customers.get<ApiCustomerV3>(customerId),
		count: 1,
		latestTotal: 20,
	});
	await expectNoExpiredCustomerProducts({ ctx, customerId, productId: pro.id });
	await expectStripeSubscriptionCorrect({ ctx, customerId });
});

test.concurrent(`${chalk.yellowBright("migrations update_plan: put update then migration patch")}`, async () => {
	const customerId = "migration-update-put-then-patch";
	const pro = products.pro({
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});

	const { autumnV1, autumnV2_2, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.billing.attach({ productId: pro.id })],
	});

	await autumnV2_2.subscriptions.update({
		customer_id: customerId,
		plan_id: pro.id,
		customize: {
			price: itemsV2.monthlyPrice({ amount: 25 }),
			items: [itemsV2.monthlyWords({ included: 120 })],
		},
	});

	await runUpdatePlanMigration({
		ctx,
		migrationClient: autumnV2_2,
		migrationId: `${customerId}-mig`,
		customerId,
		filter: { customer: { plan: { plan_id: pro.id } } },
		operations: {
			customer: [
				{
					type: "update_plan",
					plan_filter: { plan_id: pro.id },
					customize: {
						remove_items: [{ feature_id: TestFeature.Words }],
						add_items: [
							itemsV2.dashboard(),
							itemsV2.monthlyMessages({ included: 200 }),
						],
					},
				},
			],
		},
	});

	const customer = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
	expect(customer.balances[TestFeature.Words]).toBeUndefined();
	expectFlagCorrect({
		customer,
		featureId: TestFeature.Dashboard,
		planId: pro.id,
	});
	expectBalanceCorrect({
		customer,
		featureId: TestFeature.Messages,
		remaining: 200,
		usage: 0,
		planId: pro.id,
	});
	await expectCustomerInvoiceCorrect({
		customer: await autumnV1.customers.get<ApiCustomerV3>(customerId),
		count: 2,
		latestTotal: 5,
	});
	await expectNoExpiredCustomerProducts({ ctx, customerId, productId: pro.id });
	await expectStripeSubscriptionCorrect({ ctx, customerId });
});

/**
 * TDD coverage for update_plan item patch migrations.
 *
 * Contract under test:
 *   - update_plan reuses update-subscription patch semantics for add_items,
 *     remove_items, usage carry, and rollover carry.
 *   - Migration execution does not create extra invoices.
 *   - Existing customer products are patched, not replaced or expired.
 */

import { test } from "bun:test";
import type { ApiCustomerV3, ApiCustomerV5 } from "@autumn/shared";
import { BillingMethod } from "@autumn/shared";
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
import { runUpdatePlanMigration } from "../utils/runUpdatePlanMigration";

test.concurrent(`${chalk.yellowBright("migrations update_plan: consumable paid feature carries usage without charging")}`, async () => {
	const customerId = "migration-update-paid-consumable";
	const messagesUsage = 60;
	const included = 50;
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

	await autumnV1.track(
		{
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: messagesUsage,
		},
		{ timeout: 2000 },
	);

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
						remove_items: [{ feature_id: TestFeature.Messages }],
						add_items: [
							itemsV2.dashboard(),
							{
								...itemsV2.consumableMessages({ amount: 0.1 }),
								included,
							},
						],
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
	expectBalanceCorrect({
		customer,
		featureId: TestFeature.Messages,
		remaining: 0,
		usage: messagesUsage,
		planId: pro.id,
		breakdown: {
			[BillingMethod.UsageBased]: {
				included_grant: included,
				remaining: 0,
				usage: messagesUsage,
			},
		},
	});
	await expectCustomerInvoiceCorrect({
		customer: await autumnV1.customers.get<ApiCustomerV3>(customerId),
		count: 1,
		latestTotal: 20,
	});
	await expectNoExpiredCustomerProducts({ ctx, customerId, productId: pro.id });
	await expectStripeSubscriptionCorrect({ ctx, customerId });
});

// Red: migration update_plan creates the new prepaid users item with zero paid packs.
// Green: carried usage synthesizes the same inclusive quantity an attach call would receive.
test.concurrent(`${chalk.yellowBright("migrations update_plan: prepaid users replacement keeps carried usage quantity")}`, async () => {
	const customerId = "migration-update-paid-prepaid-users";
	const usersUsage = 9;
	const pro = products.pro({
		id: "migration-update-paid-prepaid-users-plan",
		items: [items.monthlyUsers({ includedUsage: 10 })],
	});

	const { autumnV1, autumnV2_2, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [
			s.billing.attach({ productId: pro.id }),
			s.track({ featureId: TestFeature.Users, value: usersUsage, timeout: 2000 }),
		],
	});

	const invoiceCountBefore =
		(await autumnV1.customers.get<ApiCustomerV3>(customerId)).invoices
			?.length ?? 0;

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
						remove_items: [{ feature_id: TestFeature.Users }],
						add_items: [
							itemsV2.prepaidUsers({
								amount: 20,
								included: 1,
							}),
						],
					},
				},
			],
		},
		runOnServer: false,
	});

	const customer = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
	await expectCustomerProducts({ customer, active: [pro.id] });
	expectBalanceCorrect({
		customer,
		featureId: TestFeature.Users,
		remaining: 0,
		usage: usersUsage,
		planId: pro.id,
		breakdown: {
			[BillingMethod.Prepaid]: {
				included_grant: 1,
				prepaid_grant: 8,
				remaining: 0,
				usage: usersUsage,
			},
		},
	});
	await expectCustomerInvoiceCorrect({
		customer: await autumnV1.customers.get<ApiCustomerV3>(customerId),
		count: invoiceCountBefore,
	});
	await expectNoExpiredCustomerProducts({ ctx, customerId, productId: pro.id });
	await expectStripeSubscriptionCorrect({ ctx, customerId });
});

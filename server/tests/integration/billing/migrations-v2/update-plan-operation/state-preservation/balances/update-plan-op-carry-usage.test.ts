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
import type { ApiCustomerV5 } from "@autumn/shared";
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
import { runUpdatePlanMigration } from "../../../utils/runUpdatePlanMigration";

test.concurrent(`${chalk.yellowBright("migrations update_plan: same-feature replacement carries only matching usage")}`, async () => {
	const customerId = "migration-update-carry-usage-same-feature";
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
						remove_items: [
							{
								feature_id: TestFeature.Messages,
								interval: BillingInterval.Month,
							},
						],
						add_items: [itemsV2.monthlyMessages({ included: 200 })],
					},
				},
			],
		},
	});

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

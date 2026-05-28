/**
 * Coverage for the custom-plan guard on `update_plan` version migrations.
 *
 * Contract under test:
 *   - `update_plan` with `version` set auto-injects `plan_filter.custom: false`
 *     via `preProcessMigrationOperations`. Customers whose customer_product
 *     has `is_custom = true` must NOT be touched by such migrations.
 *   - When a batch contains both custom and regular customers on the same
 *     plan, only the regular customers are migrated; the custom customer's
 *     version stays put and their custom feature config is preserved.
 *
 * Mirrors the legacy `migrate-custom-plans.test.ts` cases ported to the
 * migrations-v2 `update_plan` + `version` flow.
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV3, ApiCustomerV5 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectFlagCorrect } from "@tests/integration/utils/expectFlagCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { runUpdatePlanMigration } from "../../utils/runUpdatePlanMigration";

test.concurrent(`${chalk.yellowBright("update_plan custom: customer with is_custom plan is skipped")}`, async () => {
	const customerId = "migration-v2-custom-skip";

	const pro = products.pro({
		id: "v2-custom-pro",
		items: [items.monthlyMessages({ includedUsage: 500 })],
	});
	const monthlyPrice = items.monthlyPrice({ price: 20 });

	const { autumnV1, autumnV2_2, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [
			// Custom items at attach time → customer_product.is_custom = true.
			s.billing.attach({
				productId: pro.id,
				items: [monthlyPrice, items.monthlyMessages({ includedUsage: 750 })],
			}),
		],
	});

	// Sanity: custom included usage applied.
	let customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 750,
		balance: 750,
		usage: 0,
	});
	const versionBefore = customer.products?.find(
		(productOnCustomer) => productOnCustomer.id === pro.id,
	)?.version;

	// Bump the product to v2 with a smaller included usage.
	await autumnV1.products.update(pro.id, {
		items: [monthlyPrice, items.monthlyMessages({ includedUsage: 600 })],
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
					version: 2,
				},
			],
		},
	});

	// Custom plan was SKIPPED — version unchanged, custom config preserved.
	customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectCustomerProducts({ customer, active: [pro.id] });

	const versionAfter = customer.products?.find(
		(productOnCustomer) => productOnCustomer.id === pro.id,
	)?.version;
	expect(versionAfter).toBe(versionBefore);

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 750,
		balance: 750,
		usage: 0,
	});
});

test.concurrent(`${chalk.yellowBright("update_plan custom: mix of custom + regular → only regular migrated")}`, async () => {
	const regularCustomerId = "migration-v2-custom-mix-regular";
	const customCustomerId = "migration-v2-custom-mix-custom";

	const pro = products.pro({
		id: "v2-custom-mix-pro",
		items: [items.monthlyMessages({ includedUsage: 500 })],
	});
	const monthlyPrice = items.monthlyPrice({ price: 20 });

	const { autumnV1, autumnV2_2, ctx } = await initScenario({
		customerId: regularCustomerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.otherCustomers([{ id: customCustomerId, paymentMethod: "success" }]),
			s.products({ list: [pro] }),
		],
		actions: [
			// Regular customer: default product config.
			s.billing.attach({ productId: pro.id }),
			// Custom customer: overridden items → is_custom = true.
			s.billing.attach({
				customerId: customCustomerId,
				productId: pro.id,
				items: [monthlyPrice, items.monthlyMessages({ includedUsage: 800 })],
			}),
		],
	});

	// Bump product to v2.
	await autumnV1.products.update(pro.id, {
		items: [monthlyPrice, items.monthlyMessages({ includedUsage: 600 })],
	});

	await runUpdatePlanMigration({
		ctx,
		migrationClient: autumnV2_2,
		migrationId: `${regularCustomerId}-mig`,
		customerId: regularCustomerId,
		filter: { customer: { plan: { plan_id: pro.id } } },
		operations: {
			customer: [
				{
					type: "update_plan",
					plan_filter: { plan_id: pro.id },
					version: 2,
				},
			],
		},
	});

	// Regular: migrated to v2 included usage = 600.
	const regularCustomer =
		await autumnV1.customers.get<ApiCustomerV3>(regularCustomerId);
	expectCustomerFeatureCorrect({
		customer: regularCustomer,
		featureId: TestFeature.Messages,
		includedUsage: 600,
		balance: 600,
		usage: 0,
	});

	// Custom: untouched, still on 800.
	const customCustomer =
		await autumnV1.customers.get<ApiCustomerV3>(customCustomerId);
	expectCustomerFeatureCorrect({
		customer: customCustomer,
		featureId: TestFeature.Messages,
		includedUsage: 800,
		balance: 800,
		usage: 0,
	});
});

test.concurrent(`${chalk.yellowBright("update_plan custom: subscriptions.update PATCH (add_items) marks is_custom and migration skips")}`, async () => {
	const customerId = "migration-v2-custom-patch-update";

	const pro = products.pro({
		id: "v2-custom-patch-pro",
		items: [items.monthlyMessages({ includedUsage: 500 })],
	});

	const { autumnV1, autumnV2_2, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.billing.attach({ productId: pro.id })],
	});

	// Sanity: starts on default (500), no Dashboard.
	let customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 500,
		balance: 500,
		usage: 0,
	});
	const versionBefore = customer.products?.find(
		(productOnCustomer) => productOnCustomer.id === pro.id,
	)?.version;

	// PATCH-style: add Dashboard via subscriptions.update.add_items → flips is_custom = true.
	await autumnV2_2.subscriptions.update({
		customer_id: customerId,
		plan_id: pro.id,
		customize: {
			add_items: [itemsV2.dashboard()],
		},
	});

	// Dashboard is now present on the customer (patch landed).
	let customerV5 = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
	expectFlagCorrect({
		customer: customerV5,
		featureId: TestFeature.Dashboard,
		present: true,
	});

	// Bump product to v2 with different Messages count (v2 still has no Dashboard).
	await autumnV1.products.update(pro.id, {
		items: [items.monthlyMessages({ includedUsage: 600 })],
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
					version: 2,
				},
			],
		},
	});

	// Custom plan SKIPPED — version unchanged, custom Dashboard preserved,
	// Messages stays on v1's 500 (NOT migrated to v2's 600).
	customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	const versionAfter = customer.products?.find(
		(productOnCustomer) => productOnCustomer.id === pro.id,
	)?.version;
	expect(versionAfter).toBe(versionBefore);

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 500,
		balance: 500,
		usage: 0,
	});

	customerV5 = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
	expectFlagCorrect({
		customer: customerV5,
		featureId: TestFeature.Dashboard,
		present: true,
	});
});

test.concurrent(`${chalk.yellowBright("update_plan custom: subscriptions.update PUT (items replace) marks is_custom and migration skips")}`, async () => {
	const customerId = "migration-v2-custom-put-update";

	const pro = products.pro({
		id: "v2-custom-put-pro",
		items: [items.monthlyMessages({ includedUsage: 500 })],
	});

	const { autumnV1, autumnV2_2, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.billing.attach({ productId: pro.id })],
	});

	const versionBefore = (
		await autumnV1.customers.get<ApiCustomerV3>(customerId)
	).products?.find((productOnCustomer) => productOnCustomer.id === pro.id)
		?.version;

	// PUT-style customization → replaces items entirely, flips is_custom = true.
	await autumnV2_2.subscriptions.update({
		customer_id: customerId,
		plan_id: pro.id,
		customize: {
			price: itemsV2.monthlyPrice({ amount: 20 }),
			items: [itemsV2.monthlyMessages({ included: 850 })],
		},
	});

	let customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 850,
		balance: 850,
		usage: 0,
	});

	await autumnV1.products.update(pro.id, {
		items: [items.monthlyMessages({ includedUsage: 600 })],
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
					version: 2,
				},
			],
		},
	});

	customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	const versionAfter = customer.products?.find(
		(productOnCustomer) => productOnCustomer.id === pro.id,
	)?.version;
	expect(versionAfter).toBe(versionBefore);

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 850,
		balance: 850,
		usage: 0,
	});
});

test.concurrent(`${chalk.yellowBright("update_plan custom: explicit `custom: true` opts in to migrating custom plans")}`, async () => {
	const customerId = "migration-v2-custom-explicit-opt-in";

	const pro = products.pro({
		id: "v2-custom-opt-in-pro",
		items: [items.monthlyMessages({ includedUsage: 500 })],
	});
	const monthlyPrice = items.monthlyPrice({ price: 20 });

	const { autumnV1, autumnV2_2, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [
			s.billing.attach({
				productId: pro.id,
				items: [monthlyPrice, items.monthlyMessages({ includedUsage: 750 })],
			}),
		],
	});

	await autumnV1.products.update(pro.id, {
		items: [monthlyPrice, items.monthlyMessages({ includedUsage: 600 })],
	});

	// Explicit `plan_filter.custom: true` overrides the auto-injected guard —
	// caller is opting in to migrate custom plans.
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
					plan_filter: { plan_id: pro.id, custom: true },
					version: 2,
				},
			],
		},
	});

	// Migrated — included usage reflects v2 (600).
	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 600,
		balance: 600,
		usage: 0,
	});
});

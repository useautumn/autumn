/**
 * TDD coverage for update_items mixed with add_items / remove_items in the
 * same customize.
 *
 * Contract under test:
 *   New behaviors:
 *     - update_items, remove_items, and add_items in one customize compose
 *       coherently: removes drop items, updates patch existing items, adds
 *       insert new items.
 *     - update_items runs BEFORE add_items, so a feature that already has a
 *       cusEnt is updated in place rather than skipped by add_items' noop
 *       logic, and the freshly-added items in the same migration are not
 *       eligible matches for update_items.
 *     - Items that the user targets exclusively with remove_items are not
 *       also picked up by update_items running against the same product.
 */

import { test } from "bun:test";
import type { ApiCustomerV3, ApiCustomerV5 } from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { expectFlagCorrect } from "@tests/integration/utils/expectFlagCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { expect } from "bun:test";
import { runUpdatePlanMigration } from "../../utils/runUpdatePlanMigration";

test.concurrent(`${chalk.yellowBright("migrations update_items: update + add + remove compose correctly in one customize")}`, async () => {
	const customerId = "migration-update-items-mixed-compose";
	const base = products.base({
		id: "migration-update-items-mixed-compose-plan",
		items: [
			items.monthlyMessages({ includedUsage: 100 }),
			items.monthlyWords({ includedUsage: 80 }),
		],
	});

	const { autumnV1, autumnV2_2, ctx } = await initScenario({
		customerId,
		setup: [s.customer(), s.products({ list: [base] })],
		actions: [
			s.billing.attach({ productId: base.id }),
			s.track({ featureId: TestFeature.Messages, value: 20, timeout: 2000 }),
		],
	});

	await runUpdatePlanMigration({
		ctx,
		migrationClient: autumnV2_2,
		migrationId: `${customerId}-mig`,
		customerId,
		filter: { customer: { plan: { plan_id: base.id } } },
		operations: {
			customer: [
				{
					type: "update_plan",
					plan_filter: { plan_id: base.id },
					customize: {
						update_items: [
							{ filter: { feature_id: TestFeature.Messages }, included: 250 },
						],
						remove_items: [{ feature_id: TestFeature.Words }],
						add_items: [itemsV2.dashboard()],
					},
				},
			],
		},
	});

	const customer = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);

	// update_items: messages updated 100 -> 250 with 20 usage carried.
	expectBalanceCorrect({
		customer,
		featureId: TestFeature.Messages,
		remaining: 230,
		usage: 20,
		planId: base.id,
	});

	// remove_items: words dropped.
	expect(
		customer.balances[TestFeature.Words],
		"remove_items must drop the words entitlement",
	).toBeUndefined();

	// add_items: dashboard boolean now present.
	expectFlagCorrect({
		customer,
		featureId: TestFeature.Dashboard,
		planId: base.id,
	});

	await expectCustomerInvoiceCorrect({
		customer: await autumnV1.customers.get<ApiCustomerV3>(customerId),
		count: 0,
	});
});

test.concurrent(`${chalk.yellowBright("migrations update_items: filter that overlaps remove_items only deletes once")}`, async () => {
	const customerId = "migration-update-items-mixed-no-double-delete";
	const base = products.base({
		id: "migration-update-items-mixed-no-double-delete-plan",
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});

	const { autumnV2_2, ctx } = await initScenario({
		customerId,
		setup: [s.customer(), s.products({ list: [base] })],
		actions: [s.billing.attach({ productId: base.id })],
	});

	// User asks to BOTH remove and update the same item — the operation should
	// still succeed; resulting state mirrors "remove wins" since the item is
	// gone before update_items can target a fresh row.
	await runUpdatePlanMigration({
		ctx,
		migrationClient: autumnV2_2,
		migrationId: `${customerId}-mig`,
		customerId,
		filter: { customer: { plan: { plan_id: base.id } } },
		operations: {
			customer: [
				{
					type: "update_plan",
					plan_filter: { plan_id: base.id },
					customize: {
						remove_items: [{ feature_id: TestFeature.Messages }],
						update_items: [
							{ filter: { feature_id: TestFeature.Messages }, included: 999 },
						],
					},
				},
			],
		},
	});

	const customer = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
	expect(
		customer.balances[TestFeature.Messages],
		"remove + update for the same feature should leave the feature gone, not 999",
	).toBeUndefined();
});

/**
 * Mixed item operations share one execution plan: removes run first,
 * replacements second, and standalone adds last.
 */
import { expect, test } from "bun:test";
import { runChunkedMigration } from "@tests/integration/billing/migrations-v2/utils/runChunkedMigration";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { expectCustomerEntitlementRowCount } from "../batchTestUtils";
import { readScopedFeatureRow } from "../paidRowTestUtils";

test(`${chalk.yellowBright("batch migration: replace, add, and remove land in one operation")}`, async () => {
	const customerId = "batch-mixed-all-operations";
	const plan = products.base({
		id: "batch-mixed-all-plan",
		items: [
			items.dashboard(),
			items.monthlyMessages({ includedUsage: 100 }),
			items.monthlyWords({ includedUsage: 50 }),
		],
	});
	const { ctx, autumnV2_2 } = await initScenario({
		customerId,
		setup: [s.customer({ testClock: false }), s.products({ list: [plan] })],
		actions: [s.attach({ productId: plan.id })],
	});
	const messagesBefore = await readScopedFeatureRow({
		ctx,
		customerId,
		featureId: TestFeature.Messages,
	});

	const { result } = await runChunkedMigration({
		ctx,
		migrationClient: autumnV2_2,
		migrationId: "batch-mixed-all-migration",
		filter: { customer: { plan: { plan_id: plan.id, custom: false } } },
		operations: {
			customer: [
				{
					type: "update_plan",
					plan_filter: { plan_id: plan.id, custom: false },
					customize: {
						add_items: [
							itemsV2.monthlyMessages({ included: 200 }),
							itemsV2.monthlyCredits({ included: 30 }),
						],
						remove_items: [
							{ feature_id: TestFeature.Messages },
							{ feature_id: TestFeature.Words },
						],
					},
				},
			],
		},
		noBillingChanges: true,
	});

	expect({
		lane: result?.lane,
		rejections: result?.rejections ?? [],
	}).toEqual({ lane: "batch", rejections: [] });
	const messagesAfter = await readScopedFeatureRow({
		ctx,
		customerId,
		featureId: TestFeature.Messages,
	});
	expect(messagesAfter.id).toBe(messagesBefore.id);
	expect(messagesAfter.entitlement_id).not.toBe(messagesBefore.entitlement_id);

	for (const [featureId, count] of [
		[TestFeature.Messages, 1],
		[TestFeature.Credits, 1],
		[TestFeature.Words, 0],
		[TestFeature.Dashboard, 1],
	] as const) {
		await expectCustomerEntitlementRowCount({
			ctx,
			customerId,
			planId: plan.id,
			featureId,
			count,
		});
	}
});

test(`${chalk.yellowBright("batch migration: deduped add does not block a sibling remove")}`, async () => {
	const customerId = "batch-mixed-dedup-add";
	const plan = products.base({
		id: "batch-mixed-dedup-plan",
		items: [
			items.monthlyCredits({ includedUsage: 30 }),
			items.monthlyWords({ includedUsage: 50 }),
		],
	});
	const { ctx, autumnV2_2 } = await initScenario({
		customerId,
		setup: [s.customer({ testClock: false }), s.products({ list: [plan] })],
		actions: [s.attach({ productId: plan.id })],
	});
	const creditsBefore = await readScopedFeatureRow({
		ctx,
		customerId,
		featureId: TestFeature.Credits,
	});

	const { result } = await runChunkedMigration({
		ctx,
		migrationClient: autumnV2_2,
		migrationId: "batch-mixed-dedup-migration",
		filter: { customer: { plan: { plan_id: plan.id, custom: false } } },
		operations: {
			customer: [
				{
					type: "update_plan",
					plan_filter: { plan_id: plan.id, custom: false },
					customize: {
						add_items: [itemsV2.monthlyCredits({ included: 30 })],
						remove_items: [{ feature_id: TestFeature.Words }],
					},
				},
			],
		},
		noBillingChanges: true,
	});

	expect(result?.lane).toBe("batch");
	const creditsAfter = await readScopedFeatureRow({
		ctx,
		customerId,
		featureId: TestFeature.Credits,
	});
	expect(creditsAfter.id).toBe(creditsBefore.id);
	await expectCustomerEntitlementRowCount({
		ctx,
		customerId,
		planId: plan.id,
		featureId: TestFeature.Credits,
		count: 1,
	});
	await expectCustomerEntitlementRowCount({
		ctx,
		customerId,
		planId: plan.id,
		featureId: TestFeature.Words,
		count: 0,
	});
});

test(`${chalk.yellowBright("batch migration: independent plan patches execute together")}`, async () => {
	const customerId = "batch-mixed-two-plans";
	const firstPlan = products.base({
		id: "batch-mixed-first-plan",
		group: "batch-mixed-first",
		items: [items.dashboard(), items.monthlyMessages({ includedUsage: 100 })],
	});
	const secondPlan = products.base({
		id: "batch-mixed-second-plan",
		group: "batch-mixed-second",
		items: [items.monthlyWords({ includedUsage: 50 })],
	});
	const { ctx, autumnV2_2 } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: false }),
			s.products({ list: [firstPlan, secondPlan] }),
		],
		actions: [
			s.attach({ productId: firstPlan.id }),
			s.attach({ productId: secondPlan.id }),
		],
	});

	const { result } = await runChunkedMigration({
		ctx,
		migrationClient: autumnV2_2,
		migrationId: "batch-mixed-two-plans-migration",
		filter: {
			customer: {
				plan: {
					$or: [{ plan_id: firstPlan.id }, { plan_id: secondPlan.id }],
				},
			},
		},
		operations: {
			customer: [
				{
					type: "update_plan",
					plan_filter: { plan_id: firstPlan.id },
					customize: {
						remove_items: [{ feature_id: TestFeature.Messages }],
					},
				},
				{
					type: "update_plan",
					plan_filter: { plan_id: secondPlan.id },
					customize: {
						add_items: [itemsV2.monthlyWords({ included: 75 })],
						remove_items: [{ feature_id: TestFeature.Words }],
					},
				},
			],
		},
		noBillingChanges: true,
	});

	expect({
		lane: result?.lane,
		rejections: result?.rejections ?? [],
	}).toEqual({ lane: "batch", rejections: [] });
	await expectCustomerEntitlementRowCount({
		ctx,
		customerId,
		planId: firstPlan.id,
		featureId: TestFeature.Messages,
		count: 0,
	});
	await expectCustomerEntitlementRowCount({
		ctx,
		customerId,
		planId: firstPlan.id,
		featureId: TestFeature.Dashboard,
		count: 1,
	});
	await expectCustomerEntitlementRowCount({
		ctx,
		customerId,
		planId: secondPlan.id,
		featureId: TestFeature.Words,
		count: 1,
	});
});

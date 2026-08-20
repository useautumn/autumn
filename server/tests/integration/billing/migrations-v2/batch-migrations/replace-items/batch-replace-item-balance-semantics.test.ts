/**
 * Replace carries consumption by applying the grant delta, including negative
 * balances, and resets balance tracking when unlimited state changes.
 */
import { expect, test } from "bun:test";
import { runChunkedMigration } from "@tests/integration/billing/migrations-v2/utils/runChunkedMigration";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import { products } from "@tests/utils/fixtures/products";
import { pollUntil } from "@tests/utils/genUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { readScopedFeatureRow } from "../paidRowTestUtils";

test(`${chalk.yellowBright("batch migration: replace preserves overage as a negative balance")}`, async () => {
	const customerId = "batch-replace-negative-balance";
	const plan = products.base({
		id: "batch-replace-negative-plan",
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});
	const { ctx, autumnV2_2 } = await initScenario({
		customerId,
		setup: [s.customer({ testClock: false }), s.products({ list: [plan] })],
		actions: [
			s.attach({ productId: plan.id }),
			s.track({
				featureId: TestFeature.Messages,
				value: 80,
				timeout: 1_000,
			}),
		],
	});

	const before = await pollUntil({
		fetch: () =>
			readScopedFeatureRow({
				ctx,
				customerId,
				featureId: TestFeature.Messages,
			}),
		until: (row) => row.balance === 20,
		timeoutMs: 15_000,
		intervalMs: 250,
	});
	expect(before.balance).toBe(20);

	const { result } = await runChunkedMigration({
		ctx,
		migrationClient: autumnV2_2,
		migrationId: "batch-replace-negative-migration",
		filter: { customer: { plan: { plan_id: plan.id, custom: false } } },
		operations: {
			customer: [
				{
					type: "update_plan",
					plan_filter: { plan_id: plan.id, custom: false },
					customize: {
						add_items: [itemsV2.monthlyMessages({ included: 50 })],
						remove_items: [{ feature_id: TestFeature.Messages }],
					},
				},
			],
		},
		noBillingChanges: true,
	});

	expect(result?.lane).toBe("batch");
	const after = await readScopedFeatureRow({
		ctx,
		customerId,
		featureId: TestFeature.Messages,
	});
	expect(after.id).toBe(before.id);
	expect(after.balance).toBe(-30);
});

test(`${chalk.yellowBright("batch migration: replace switches fixed usage to unlimited")}`, async () => {
	const customerId = "batch-replace-to-unlimited";
	const plan = products.base({
		id: "batch-replace-to-unlimited-plan",
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});
	const { ctx, autumnV2_2 } = await initScenario({
		customerId,
		setup: [s.customer({ testClock: false }), s.products({ list: [plan] })],
		actions: [s.attach({ productId: plan.id })],
	});

	const before = await readScopedFeatureRow({
		ctx,
		customerId,
		featureId: TestFeature.Messages,
	});
	const { result } = await runChunkedMigration({
		ctx,
		migrationClient: autumnV2_2,
		migrationId: "batch-replace-to-unlimited-migration",
		filter: { customer: { plan: { plan_id: plan.id, custom: false } } },
		operations: {
			customer: [
				{
					type: "update_plan",
					plan_filter: { plan_id: plan.id, custom: false },
					customize: {
						add_items: [{ feature_id: TestFeature.Messages, unlimited: true }],
						remove_items: [{ feature_id: TestFeature.Messages }],
					},
				},
			],
		},
		noBillingChanges: true,
	});

	expect(result?.lane).toBe("batch");
	const after = await readScopedFeatureRow({
		ctx,
		customerId,
		featureId: TestFeature.Messages,
	});
	expect(after.id).toBe(before.id);
	expect(after.unlimited).toBe(true);
	expect(after.balance).toBe(0);
});

test(`${chalk.yellowBright("batch migration: replace switches unlimited usage to fixed")}`, async () => {
	const customerId = "batch-replace-from-unlimited";
	const plan = products.base({
		id: "batch-replace-from-unlimited-plan",
		items: [items.unlimitedMessages()],
	});
	const { ctx, autumnV2_2 } = await initScenario({
		customerId,
		setup: [s.customer({ testClock: false }), s.products({ list: [plan] })],
		actions: [s.attach({ productId: plan.id })],
	});

	const before = await readScopedFeatureRow({
		ctx,
		customerId,
		featureId: TestFeature.Messages,
	});
	const { result } = await runChunkedMigration({
		ctx,
		migrationClient: autumnV2_2,
		migrationId: "batch-replace-from-unlimited-migration",
		filter: { customer: { plan: { plan_id: plan.id, custom: false } } },
		operations: {
			customer: [
				{
					type: "update_plan",
					plan_filter: { plan_id: plan.id, custom: false },
					customize: {
						add_items: [itemsV2.monthlyMessages({ included: 50 })],
						remove_items: [{ feature_id: TestFeature.Messages }],
					},
				},
			],
		},
		noBillingChanges: true,
	});

	expect(result?.lane).toBe("batch");
	const after = await readScopedFeatureRow({
		ctx,
		customerId,
		featureId: TestFeature.Messages,
	});
	expect(after.id).toBe(before.id);
	expect(after.unlimited).toBe(false);
	expect(after.balance).toBe(50);
});

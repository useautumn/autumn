/**
 * Preview coverage for legacy update_items migrations.
 *
 * Contract under test:
 *   - update_items balance_changes use the balance snapshot +
 *     previous_attributes shape.
 *   - Untouched features do not emit balance_changes.
 *   - Carried usage remains in the post-preview balance and is omitted from
 *     previous_attributes when unchanged.
 */

import { test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import {
	expectMigrationPreviewCorrect,
	expectNoPreviewBalanceChange,
	expectPreviewBalanceChange,
	expectPreviewPlanChange,
} from "./expectMigrationPreviewCorrect";
import { runUpdatePlanPreview } from "./previewTestUtils";

test(`${chalk.yellowBright("migrations preview update_items: emits balance snapshot and item change")}`, async () => {
	const suffix = Date.now();
	const customerId = `migration-preview-update-items-${suffix}`;
	const freePlan = products.base({
		id: `migration-preview-update-items-plan-${suffix}`,
		items: [
			items.monthlyMessages({ includedUsage: 100 }),
			items.monthlyCredits({ includedUsage: 50 }),
		],
	});

	const { autumnV2_2 } = await initScenario({
		customerId,
		setup: [s.customer(), s.products({ list: [freePlan] })],
		actions: [s.billing.attach({ productId: freePlan.id })],
	});

	const preview = await runUpdatePlanPreview({
		autumn: autumnV2_2,
		migrationId: `${customerId}-mig`,
		filter: { customer: { plan: { plan_id: freePlan.id } } },
		operations: {
			customer: [
				{
					type: "update_plan",
					plan_filter: { plan_id: freePlan.id },
					customize: {
						update_items: [
							{ filter: { feature_id: TestFeature.Messages }, included: 250 },
						],
					},
				},
			],
		},
	});

	expectMigrationPreviewCorrect({ preview, customerId, log: false });
	expectNoPreviewBalanceChange({
		preview,
		featureId: TestFeature.Credits,
	});
	expectPreviewBalanceChange({
		preview,
		featureId: TestFeature.Messages,
		balance: {
			granted: 250,
			remaining: 250,
			usage: 0,
		},
		previousAttributes: {
			granted: 100,
			remaining: 100,
		},
		absentPreviousAttributes: ["usage"],
	});
	expectPreviewPlanChange({
		preview,
		action: "updated",
		planId: freePlan.id,
		itemChanges: [
			{
				action: "created",
				feature_id: TestFeature.Messages,
			},
			{
				action: "deleted",
				feature_id: TestFeature.Messages,
			},
		],
	});
});

test(`${chalk.yellowBright("migrations preview update_items: carried usage is preserved in balance change")}`, async () => {
	const suffix = Date.now();
	const customerId = `migration-preview-update-items-usage-${suffix}`;
	const freePlan = products.base({
		id: `migration-preview-update-items-usage-plan-${suffix}`,
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});

	const { autumnV2_2 } = await initScenario({
		customerId,
		setup: [s.customer(), s.products({ list: [freePlan] })],
		actions: [
			s.billing.attach({ productId: freePlan.id }),
			s.track({ featureId: TestFeature.Messages, value: 30, timeout: 2000 }),
		],
	});

	const preview = await runUpdatePlanPreview({
		autumn: autumnV2_2,
		migrationId: `${customerId}-mig`,
		filter: { customer: { plan: { plan_id: freePlan.id } } },
		operations: {
			customer: [
				{
					type: "update_plan",
					plan_filter: { plan_id: freePlan.id },
					customize: {
						update_items: [
							{ filter: { feature_id: TestFeature.Messages }, included: 300 },
						],
					},
				},
			],
		},
	});

	expectMigrationPreviewCorrect({ preview, customerId, log: false });
	expectPreviewBalanceChange({
		preview,
		featureId: TestFeature.Messages,
		balance: {
			granted: 300,
			remaining: 270,
			usage: 30,
		},
		previousAttributes: {
			granted: 100,
			remaining: 70,
		},
		absentPreviousAttributes: ["usage"],
	});
});

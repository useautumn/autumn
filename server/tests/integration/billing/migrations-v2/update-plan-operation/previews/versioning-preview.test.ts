/**
 * TDD coverage for update_plan version preview scenarios.
 *
 * Contract under test:
 *   New behaviors:
 *     - Version previews use the webhook-shaped plan change contract.
 *     - Version previews emit balance_changes for metered grant changes and
 *       flag_changes for boolean removals.
 */

import { expect, test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import {
	expectMigrationPreviewCorrect,
	expectPreviewBalanceChange,
	expectPreviewFlagChanges,
	expectPreviewPlanChange,
} from "./expectMigrationPreviewCorrect";
import { runUpdatePlanPreview } from "./previewTestUtils";

test(`${chalk.yellowBright("migrations preview version: emits plan, balance, and flag changes")}`, async () => {
	const suffix = Date.now();
	const customerId = `migration-preview-version-update-${suffix}`;
	const base = products.base({
		id: `migration-preview-version-update-plan-${suffix}`,
		items: [items.monthlyMessages({ includedUsage: 100 }), items.adminRights()],
	});

	const { autumnV1, autumnV2_2 } = await initScenario({
		customerId,
		setup: [s.customer(), s.products({ list: [base] })],
		actions: [s.billing.attach({ productId: base.id })],
	});

	await autumnV1.products.update(base.id, {
		items: [
			items.monthlyMessages({ includedUsage: 200 }),
			items.monthlyCredits({ includedUsage: 50 }),
		],
	});

	const preview = await runUpdatePlanPreview({
		autumn: autumnV2_2,
		migrationId: `${customerId}-mig`,
		filter: { customer: { plan: { plan_id: base.id } } },
		operations: {
			customer: [
				{
					type: "update_plan",
					plan_filter: { plan_id: base.id },
					version: 2,
				},
			],
		},
	});

	expectMigrationPreviewCorrect({ preview, customerId, log: false });
	const planChange = expectPreviewPlanChange({
		preview,
		action: "updated",
		planId: base.id,
	});
	expect(planChange.item_changes).toEqual([]);
	expectPreviewBalanceChange({
		preview,
		featureId: TestFeature.Messages,
		balance: { granted: 200, remaining: 200, usage: 0 },
		previousAttributes: { granted: 100, remaining: 100 },
	});
	expectPreviewBalanceChange({
		preview,
		featureId: TestFeature.Credits,
		balance: { granted: 50, remaining: 50, usage: 0 },
		previousAttributes: { granted: 0, remaining: 0 },
	});
	expectPreviewFlagChanges({
		preview,
		changes: [{ action: "deleted", feature_id: TestFeature.AdminRights }],
	});
});

/**
 * TDD coverage for update_plan preview state-preservation scenarios.
 *
 * Contract under test:
 *   New behaviors:
 *     - Same-feature delete/add previews preserve carried usage in the post
 *       balance snapshot.
 *     - previous_attributes contains old grant/remaining values and omits
 *       usage when usage itself did not change.
 */

import { test } from "bun:test";
import { ResetInterval } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import {
	expectMigrationPreviewCorrect,
	expectPreviewBalanceChange,
	expectPreviewPlanChange,
} from "./expectMigrationPreviewCorrect";
import { runUpdatePlanPreview } from "./previewTestUtils";

test(`${chalk.yellowBright("migrations preview state: same-feature replacement carries usage into balance change")}`, async () => {
	const suffix = Date.now();
	const customerId = `migration-preview-carry-usage-${suffix}`;
	const base = products.base({
		id: `migration-preview-carry-usage-plan-${suffix}`,
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});

	const { autumnV2_2 } = await initScenario({
		customerId,
		setup: [s.customer(), s.products({ list: [base] })],
		actions: [
			s.billing.attach({ productId: base.id }),
			s.track({ featureId: TestFeature.Messages, value: 30, timeout: 2000 }),
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
					customize: {
						remove_items: [{ feature_id: TestFeature.Messages }],
						add_items: [
							{
								feature_id: TestFeature.Messages,
								included: 200,
								reset: { interval: ResetInterval.Month },
							},
						],
					},
				},
			],
		},
	});

	expectMigrationPreviewCorrect({ preview, customerId, log: false });
	expectPreviewPlanChange({
		preview,
		action: "updated",
		planId: base.id,
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
	expectPreviewBalanceChange({
		preview,
		featureId: TestFeature.Messages,
		balance: {
			granted: 200,
			remaining: 170,
			usage: 30,
		},
		previousAttributes: {
			granted: 100,
			remaining: 70,
		},
		absentPreviousAttributes: ["usage"],
	});
});

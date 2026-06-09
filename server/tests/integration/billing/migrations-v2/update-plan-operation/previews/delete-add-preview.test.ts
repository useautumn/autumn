/**
 * TDD coverage for update_plan delete/add preview output.
 *
 * Contract under test:
 *   New types/fields:
 *     - plan_changes: structured array of plan-change objects, never JSON strings.
 *     - plan_changes[i].item_changes: structured array of item-change objects.
 *     - balance_changes: structured balance snapshots with sparse previous_attributes.
 *   New endpoints:
 *     - None; existing migrations dry-run item events return response.preview.
 *   New behaviors:
 *     - Monthly credits -> one-off prepaid credits emits created/deleted
 *       item_changes and a balance_change whose post-state has next_reset_at: null.
 *     - Monthly credits included +100 emits created/deleted item_changes and a
 *       balance_change for credits reflecting the +100 grant/remaining delta.
 *   Side effects:
 *     - Dry-run preview does not execute billing changes.
 *
 * Pre-impl red: Tinybird-backed event responses can expose nested preview
 * fields as JSON strings, and delete/add item changes may be empty.
 * Post-impl green: preview consumers receive structured plan/item/balance changes.
 */

import { expect, test } from "bun:test";
import { BillingInterval, BillingMethod, ResetInterval } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import {
	expectMigrationPreviewCorrect,
	expectPreviewBalanceChange,
	expectPreviewFlagChanges,
	expectPreviewPlanChange,
} from "./expectMigrationPreviewCorrect";
import { runUpdatePlanPreview, waitForPreview } from "./previewTestUtils";

test(`${chalk.yellowBright("migrations preview delete/add: API run + list emits monthly credits to one-off changes")}`, async () => {
	const suffix = Date.now();
	const customerId = `migration-preview-monthly-to-one-off-${suffix}`;
	const pro = products.pro({
		id: `migration-preview-monthly-to-one-off-plan-${suffix}`,
		items: [items.monthlyCredits({ includedUsage: 100 })],
	});

	const { autumnV2_2 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.billing.attach({ productId: pro.id })],
	});

	const migration = await autumnV2_2.migrationsV2.deleteAndCreate({
		id: `${customerId}-mig`,
		filter: { customer: { plan: { plan_id: pro.id } } },
		operations: {
			customer: [
				{
					type: "update_plan",
					plan_filter: { plan_id: pro.id },
					customize: {
						remove_items: [{ feature_id: TestFeature.Credits }],
						add_items: [
							{
								feature_id: TestFeature.Credits,
								included: 150,
								price: {
									amount: 10,
									interval: BillingInterval.OneOff,
									billing_method: BillingMethod.Prepaid,
									billing_units: 100,
								},
							},
						],
					},
				},
			],
		},
		no_billing_changes: true,
	});
	const runResponse = await autumnV2_2.migrationsV2.run({
		id: migration.id,
		dry_run: true,
	});
	const preview = await waitForPreview({
		autumn: autumnV2_2,
		migrationId: migration.id,
		migrationRunId: runResponse.run_id,
	});

	expectMigrationPreviewCorrect({ preview, customerId, log: false });
	expect(preview.flag_changes).toEqual([]);
	const planChange = expectPreviewPlanChange({
		preview,
		action: "updated",
		planId: pro.id,
		itemChanges: [
			{
				action: "created",
				feature_id: TestFeature.Credits,
			},
			{
				action: "deleted",
				feature_id: TestFeature.Credits,
			},
		],
	});
	const createdCreditsChange = planChange.item_changes.find(
		(change) =>
			change.action === "created" && change.feature_id === TestFeature.Credits,
	);
	const deletedCreditsChange = planChange.item_changes.find(
		(change) =>
			change.action === "deleted" && change.feature_id === TestFeature.Credits,
	);
	expect(createdCreditsChange?.item).toEqual(
		expect.objectContaining({
			feature_id: TestFeature.Credits,
			included: 150,
			reset: expect.objectContaining({ interval: BillingInterval.OneOff }),
			price: expect.objectContaining({
				billing_method: BillingMethod.Prepaid,
				interval: BillingInterval.OneOff,
			}),
		}),
	);
	expect(deletedCreditsChange?.item).toEqual(
		expect.objectContaining({
			feature_id: TestFeature.Credits,
			included: 100,
			reset: expect.objectContaining({ interval: ResetInterval.Month }),
		}),
	);
	const creditsBalanceChange = expectPreviewBalanceChange({
		preview,
		featureId: TestFeature.Credits,
		balance: {
			granted: 150,
			remaining: 150,
			usage: 0,
			next_reset_at: null,
		},
		previousAttributes: {
			granted: 100,
			remaining: 100,
		},
	});
	expect(creditsBalanceChange.previous_attributes.next_reset_at).not.toBeNull();
});

test(`${chalk.yellowBright("migrations preview delete/add: monthly included increase is reflected in balance changes")}`, async () => {
	const suffix = Date.now();
	const customerId = `migration-preview-included-increase-${suffix}`;
	const pro = products.pro({
		id: `migration-preview-included-increase-plan-${suffix}`,
		items: [items.monthlyCredits({ includedUsage: 100 })],
	});

	const { autumnV2_2 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.billing.attach({ productId: pro.id })],
	});

	const preview = await runUpdatePlanPreview({
		autumn: autumnV2_2,
		migrationId: `${customerId}-mig`,
		filter: { customer: { plan: { plan_id: pro.id } } },
		operations: {
			customer: [
				{
					type: "update_plan",
					plan_filter: { plan_id: pro.id },
					customize: {
						remove_items: [{ feature_id: TestFeature.Credits }],
						add_items: [
							{
								feature_id: TestFeature.Credits,
								included: 200,
								reset: { interval: ResetInterval.Month },
							},
						],
					},
				},
			],
		},
		noBillingChanges: true,
	});

	expectMigrationPreviewCorrect({ preview, customerId, log: false });
	expectPreviewPlanChange({
		preview,
		action: "updated",
		planId: pro.id,
		itemChanges: [
			{
				action: "created",
				feature_id: TestFeature.Credits,
			},
			{
				action: "deleted",
				feature_id: TestFeature.Credits,
			},
		],
	});
	expectPreviewBalanceChange({
		preview,
		featureId: TestFeature.Credits,
		balance: {
			granted: 200,
			remaining: 200,
			usage: 0,
		},
		previousAttributes: {
			granted: 100,
			remaining: 100,
		},
		absentPreviousAttributes: ["usage"],
	});
});

test(`${chalk.yellowBright("migrations preview delete/add: boolean item add/remove emits flag changes")}`, async () => {
	const suffix = Date.now();
	const customerId = `migration-preview-flags-${suffix}`;
	const freePlan = products.base({
		id: `migration-preview-flags-plan-${suffix}`,
		items: [items.adminRights()],
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
						remove_items: [{ feature_id: TestFeature.AdminRights }],
						add_items: [itemsV2.dashboard()],
					},
				},
			],
		},
	});

	expectMigrationPreviewCorrect({ preview, customerId, log: false });
	expect(preview.balance_changes).toEqual([]);
	expectPreviewFlagChanges({
		preview,
		changes: [
			{ action: "deleted", feature_id: TestFeature.AdminRights },
			{ action: "created", feature_id: TestFeature.Dashboard },
		],
	});
	expectPreviewPlanChange({
		preview,
		action: "updated",
		planId: freePlan.id,
		itemChanges: [
			{
				action: "deleted",
				feature_id: TestFeature.AdminRights,
			},
			{
				action: "created",
				feature_id: TestFeature.Dashboard,
			},
		],
	});
});

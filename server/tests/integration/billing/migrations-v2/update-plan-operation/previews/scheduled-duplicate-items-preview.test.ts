/**
 * Active and scheduled rows for the same plan must stay separate in previews.
 * Merging them duplicates boolean item_changes and hides the scheduled scope.
 */

import { expect, test } from "bun:test";
import { ms } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { expectMigrationPreviewCorrect } from "./expectMigrationPreviewCorrect";
import type { PreviewMigrateCustomer, PreviewPlanChange } from "./previewTestUtils";
import { runUpdatePlanPreview } from "./previewTestUtils";

const getPreviewPlanId = (change: PreviewPlanChange): string | undefined =>
	change.subscription?.plan_id ?? change.purchase?.plan_id;

const getUpdatedPlanChanges = ({
	preview,
	planId,
}: {
	preview: PreviewMigrateCustomer;
	planId: string;
}) =>
	preview.plan_changes.filter(
		(change) => change.action === "updated" && getPreviewPlanId(change) === planId,
	);

const getCreatedFeatureIds = (change: PreviewPlanChange) =>
	change.item_changes
		.filter((itemChange) => itemChange.action === "created")
		.map((itemChange) => itemChange.feature_id)
		.sort();

test(`${chalk.yellowBright("migrations preview scheduled: same-plan active and scheduled updates do not duplicate item changes")}`, async () => {
	const suffix = Date.now();
	const customerId = `migration-preview-scheduled-duplicate-${suffix}`;
	const plan = products.base({
		id: `migration-preview-scheduled-duplicate-plan-${suffix}`,
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});

	const { autumnV1, autumnV2_2 } = await initScenario({
		customerId,
		setup: [s.customer(), s.products({ list: [plan] })],
		actions: [],
	});

	const now = Date.now();
	await autumnV1.billing.createSchedule({
		customer_id: customerId,
		phases: [
			{
				starts_at: now,
				plans: [{ plan_id: plan.id }],
			},
			{
				starts_at: now + ms.days(30),
				plans: [{ plan_id: plan.id }],
			},
		],
	});

	const preview = await runUpdatePlanPreview({
		autumn: autumnV2_2,
		migrationId: `${customerId}-mig`,
		filter: { customer: { plan: { plan_id: plan.id } } },
		operations: {
			customer: [
				{
					type: "update_plan",
					plan_filter: { plan_id: plan.id },
					customize: {
						add_items: [
							itemsV2.dashboard(),
							{ feature_id: TestFeature.AdminRights },
						],
					},
				},
			],
		},
		log: false,
	});

	expectMigrationPreviewCorrect({ preview, customerId, log: false });
	expect(
		preview.flag_changes.filter(
			(change) => change.feature_id === TestFeature.AdminRights,
		),
	).toHaveLength(1);
	expect(
		preview.flag_changes.filter(
			(change) => change.feature_id === TestFeature.Dashboard,
		),
	).toHaveLength(1);

	const planChanges = getUpdatedPlanChanges({ preview, planId: plan.id });
	expect(planChanges).toHaveLength(2);
	for (const planChange of planChanges) {
		expect(getCreatedFeatureIds(planChange)).toEqual([
			TestFeature.AdminRights,
			TestFeature.Dashboard,
		]);
	}
});

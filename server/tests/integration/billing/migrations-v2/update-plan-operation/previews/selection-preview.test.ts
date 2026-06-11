/**
 * Preview coverage for update_plan selection metadata.
 *
 * Contract under test:
 *   - Entity-scoped customer products still surface webhook-style plan changes.
 */

import { test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import {
	expectMigrationPreviewCorrect,
	expectPreviewPlanChange,
} from "./expectMigrationPreviewCorrect";
import { runUpdatePlanPreview } from "./previewTestUtils";

test(`${chalk.yellowBright("migrations preview selection: entity-scoped plan changes use webhook shape")}`, async () => {
	const suffix = Date.now();
	const customerId = `migration-preview-entity-${suffix}`;
	const entityPlan = products.base({
		id: `migration-preview-entity-plan-${suffix}`,
		items: [],
	});

	const { autumnV2_2 } = await initScenario({
		customerId,
		setup: [
			s.customer(),
			s.entities({ count: 1, featureId: TestFeature.Users }),
			s.products({ list: [entityPlan] }),
		],
		actions: [
			s.billing.attach({
				productId: entityPlan.id,
				entityIndex: 0,
			}),
		],
	});

	const preview = await runUpdatePlanPreview({
		autumn: autumnV2_2,
		migrationId: `${customerId}-mig`,
		filter: { customer: { plan: { plan_id: entityPlan.id } } },
		operations: {
			customer: [
				{
					type: "update_plan",
					plan_filter: { plan_id: entityPlan.id },
					customize: {
						add_items: [itemsV2.dashboard()],
					},
				},
			],
		},
	});

	expectMigrationPreviewCorrect({ preview, customerId, log: false });
	expectPreviewPlanChange({
		preview,
		action: "updated",
		planId: entityPlan.id,
	});
});

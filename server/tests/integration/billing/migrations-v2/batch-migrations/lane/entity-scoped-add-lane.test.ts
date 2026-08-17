/**
 * Entity-scoped adds must leave the batch lane.
 *
 * Contract under test:
 *   - An add_items whose item carries `entity_feature_id` fans out one row per
 *     entity, so a page's row count stops being a function of its customer
 *     count. `checkUpdatePlanTransitionEligibility` rejects it
 *     (`entity_scoped_entitlement`) and the whole run takes the
 *     per-customer lane.
 *   - The add still lands — routing to the other lane must not drop work.
 *   - The identical migration WITHOUT `entity_feature_id` stays on the batch
 *     lane, so the entity field is provably the discriminator rather than
 *     anything else about the setup.
 *
 * Rejections are migration-wide: one entity-scoped add anywhere routes every
 * operation in the run, which is why the control case is a separate migration.
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV5, ApiEntityV2 } from "@autumn/shared";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { runChunkedMigration } from "../../utils/runChunkedMigration";

const ADDED_MESSAGES = 10;

test.concurrent(
	`${chalk.yellowBright("batch lane: an entity-scoped add_items routes the run to the per-customer lane")}`,
	async () => {
		const customerId = "batch-lane-entity-scoped";
		const plan = products.base({
			id: "batch-lane-entity-scoped-plan",
			items: [],
		});

		const { autumnV2_2, ctx, entities } = await initScenario({
			customerId,
			setup: [
				s.customer(),
				s.products({ list: [plan] }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
			],
			actions: [s.billing.attach({ productId: plan.id })],
		});

		const { result } = await runChunkedMigration({
			ctx,
			migrationClient: autumnV2_2,
			migrationId: "batch-lane-entity-scoped-mig",
			filter: { customer: { plan: { plan_id: plan.id } } },
			operations: {
				customer: [
					{
						type: "update_plan",
						plan_filter: { plan_id: plan.id },
						customize: {
							add_items: [
								{
									...itemsV2.monthlyMessages({ included: ADDED_MESSAGES }),
									entity_feature_id: TestFeature.Users,
								},
							],
						},
					},
				],
			},
			noBillingChanges: true,
		});

		// ── Contract: the entity-scoped add is not batch-lowered ─────────
		expect(result?.lane).toBe("per_customer");

		// ── Contract: routing lanes did not drop the work ────────────────
		for (const entity of entities) {
			const entityView = await autumnV2_2.entities.get<ApiEntityV2>(
				customerId,
				entity.id,
			);
			expectBalanceCorrect({
				customer: entityView,
				featureId: TestFeature.Messages,
				remaining: ADDED_MESSAGES,
				usage: 0,
			});
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("batch lane: the same add without entity_feature_id stays on the batch lane")}`,
	async () => {
		const customerId = "batch-lane-entity-control";
		const plan = products.base({
			id: "batch-lane-entity-control-plan",
			items: [],
		});

		const { autumnV2_2, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer(),
				s.products({ list: [plan] }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
			],
			actions: [s.billing.attach({ productId: plan.id })],
		});

		const { result } = await runChunkedMigration({
			ctx,
			migrationClient: autumnV2_2,
			migrationId: "batch-lane-entity-control-mig",
			filter: { customer: { plan: { plan_id: plan.id } } },
			operations: {
				customer: [
					{
						type: "update_plan",
						plan_filter: { plan_id: plan.id },
						customize: {
							add_items: [
								itemsV2.monthlyMessages({ included: ADDED_MESSAGES }),
							],
						},
					},
				],
			},
			noBillingChanges: true,
		});

		// Same customer shape, same entities, same item — only the
		// entity_feature_id is gone, and the run batches.
		expect(result?.lane).toBe("batch");

		const customer = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
		expectBalanceCorrect({
			customer,
			featureId: TestFeature.Messages,
			remaining: ADDED_MESSAGES,
			usage: 0,
			planId: plan.id,
		});
	},
);

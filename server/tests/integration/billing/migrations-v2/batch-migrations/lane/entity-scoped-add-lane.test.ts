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

		expect(result?.lane).toBe("per_customer");

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

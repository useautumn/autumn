/**
 * TDD: the batch lane must respect `custom` in the plan filter.
 *
 * Contract under test:
 *   New behaviours:
 *     - `custom: false` → ONLY non-customized customer products are migrated;
 *       customized ones are left untouched.
 *     - `custom: true`  → ONLY customized customer products are migrated.
 *     - `custom` omitted → BOTH are migrated (no implicit exclusion).
 *     - the constraint is per customer PRODUCT, not per customer: a customer
 *       holding one customized and one plain product on the same plan has
 *       only the matching row mutated.
 *   Side effects:
 *     - every claimed customer that owns a matching row is marked succeeded.
 *
 * Pre-impl red: `customerProductsScopeFilter` hardcodes `is_custom = false`,
 * so `custom: true` migrates nothing and `custom: undefined` silently skips
 * customized products.
 * Post-impl green: the resolved constraint flows from the filter/op into the
 * page scope + partition.
 */

import { expect, test } from "bun:test";
import {
	type ApiCustomerV5,
	type ApiEntityV2,
	MigrationItemRunStatus,
} from "@autumn/shared";
import type { PlanFilter } from "@autumn/shared/api/migrations/filters/planFilter.js";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { runChunkedMigration } from "../../utils/runChunkedMigration";
import { expectMigrationItemRunStatus } from "../batchTestUtils";

const ADDED_WORKFLOWS = 10;
/** Customized attach gives this plan a non-catalog workflow allowance. */
const CUSTOM_WORKFLOWS = 25;

const addWorkflowsOperation = ({ planId }: { planId: string }) => ({
	customer: [
		{
			type: "update_plan" as const,
			plan_filter: { plan_id: planId },
			customize: {
				add_items: [
					{ feature_id: TestFeature.Words, included: ADDED_WORKFLOWS },
				],
			},
		},
	],
});

/** Words is absent from every fixture plan, so its presence after the run is
 * exactly "this customer product was migrated". */
const expectWordsAdded = ({
	customer,
	planId,
	added,
}: {
	customer: ApiCustomerV5;
	planId: string;
	added: boolean;
}) => {
	if (!added) {
		expect(customer.balances[TestFeature.Words]).toBeUndefined();
		return;
	}
	expectBalanceCorrect({
		customer,
		featureId: TestFeature.Words,
		remaining: ADDED_WORKFLOWS,
		usage: 0,
		planId,
	});
};

const runCustomFilterMigration = async ({
	ctx,
	autumnV2_2,
	migrationId,
	planId,
	custom,
}: {
	// biome-ignore lint/suspicious/noExplicitAny: scenario ctx/client passthrough
	ctx: any;
	// biome-ignore lint/suspicious/noExplicitAny: scenario ctx/client passthrough
	autumnV2_2: any;
	migrationId: string;
	planId: string;
	custom?: boolean;
}) => {
	const plan: PlanFilter =
		custom === undefined ? { plan_id: planId } : { plan_id: planId, custom };

	const result = await runChunkedMigration({
		ctx,
		migrationClient: autumnV2_2,
		migrationId,
		filter: { customer: { plan } },
		operations: addWorkflowsOperation({ planId }),
		noBillingChanges: true,
	});
	expect(result.result?.lane).toBe("batch");
	return result;
};

test.concurrent(
	`${chalk.yellowBright("batch filters: custom false migrates only non-customized products")}`,
	async () => {
		const plainId = "batch-custom-false-plain";
		const customizedId = "batch-custom-false-customized";
		const plan = products.base({ id: "batch-custom-false-plan", items: [] });

		const { autumnV2_2, ctx } = await initScenario({
			customerId: plainId,
			setup: [
				s.customer(),
				s.otherCustomers([{ id: customizedId }]),
				s.products({ list: [plan] }),
			],
			actions: [
				s.parallel(
					s.billing.attach({ productId: plan.id }),
					s.billing.attach({
						customerId: customizedId,
						productId: plan.id,
						items: [
							items.freeAllocatedWorkflows({ includedUsage: CUSTOM_WORKFLOWS }),
						],
					}),
				),
			],
		});

		const { migration, migrationRunId } = await runCustomFilterMigration({
			ctx,
			autumnV2_2,
			migrationId: "batch-custom-false-mig",
			planId: plan.id,
			custom: false,
		});

		expectWordsAdded({
			customer: await autumnV2_2.customers.get<ApiCustomerV5>(plainId),
			planId: plan.id,
			added: true,
		});
		expectWordsAdded({
			customer: await autumnV2_2.customers.get<ApiCustomerV5>(customizedId),
			planId: plan.id,
			added: false,
		});

		await expectMigrationItemRunStatus({
			ctx,
			migrationInternalId: migration.internal_id,
			migrationRunId,
			customerId: plainId,
			status: MigrationItemRunStatus.Succeeded,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("batch filters: custom true migrates only customized products")}`,
	async () => {
		const plainId = "batch-custom-true-plain";
		const customizedId = "batch-custom-true-customized";
		const plan = products.base({ id: "batch-custom-true-plan", items: [] });

		const { autumnV2_2, ctx } = await initScenario({
			customerId: plainId,
			setup: [
				s.customer(),
				s.otherCustomers([{ id: customizedId }]),
				s.products({ list: [plan] }),
			],
			actions: [
				s.parallel(
					s.billing.attach({ productId: plan.id }),
					s.billing.attach({
						customerId: customizedId,
						productId: plan.id,
						items: [
							items.freeAllocatedWorkflows({ includedUsage: CUSTOM_WORKFLOWS }),
						],
					}),
				),
			],
		});

		const { migration, migrationRunId } = await runCustomFilterMigration({
			ctx,
			autumnV2_2,
			migrationId: "batch-custom-true-mig",
			planId: plan.id,
			custom: true,
		});

		expectWordsAdded({
			customer: await autumnV2_2.customers.get<ApiCustomerV5>(customizedId),
			planId: plan.id,
			added: true,
		});
		expectWordsAdded({
			customer: await autumnV2_2.customers.get<ApiCustomerV5>(plainId),
			planId: plan.id,
			added: false,
		});

		await expectMigrationItemRunStatus({
			ctx,
			migrationInternalId: migration.internal_id,
			migrationRunId,
			customerId: customizedId,
			status: MigrationItemRunStatus.Succeeded,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("batch filters: custom omitted migrates both customized and plain")}`,
	async () => {
		const plainId = "batch-custom-any-plain";
		const customizedId = "batch-custom-any-customized";
		const plan = products.base({ id: "batch-custom-any-plan", items: [] });

		const { autumnV2_2, ctx } = await initScenario({
			customerId: plainId,
			setup: [
				s.customer(),
				s.otherCustomers([{ id: customizedId }]),
				s.products({ list: [plan] }),
			],
			actions: [
				s.parallel(
					s.billing.attach({ productId: plan.id }),
					s.billing.attach({
						customerId: customizedId,
						productId: plan.id,
						items: [
							items.freeAllocatedWorkflows({ includedUsage: CUSTOM_WORKFLOWS }),
						],
					}),
				),
			],
		});

		await runCustomFilterMigration({
			ctx,
			autumnV2_2,
			migrationId: "batch-custom-any-mig",
			planId: plan.id,
		});

		for (const customerId of [plainId, customizedId]) {
			expectWordsAdded({
				customer: await autumnV2_2.customers.get<ApiCustomerV5>(customerId),
				planId: plan.id,
				added: true,
			});
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("batch filters: custom false is per customer product across entities")}`,
	async () => {
		const customerId = "batch-custom-entities";
		const plan = products.base({ id: "batch-custom-entities-plan", items: [] });

		// Same customer, same plan, two entity-scoped rows: one plain, one
		// customized — the constraint must apply per row, not per customer.
		const { autumnV2_2, ctx, entities } = await initScenario({
			customerId,
			setup: [
				s.customer(),
				s.products({ list: [plan] }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
			],
			actions: [
				s.billing.attach({ productId: plan.id, entityIndex: 0 }),
				s.billing.attach({
					productId: plan.id,
					entityIndex: 1,
					items: [
						items.freeAllocatedWorkflows({ includedUsage: CUSTOM_WORKFLOWS }),
					],
				}),
			],
		});

		await runCustomFilterMigration({
			ctx,
			autumnV2_2,
			migrationId: "batch-custom-entities-mig",
			planId: plan.id,
			custom: false,
		});

		const [plainEntity, customizedEntity] = entities;
		const plainEntityView = await autumnV2_2.entities.get<ApiEntityV2>(
			customerId,
			plainEntity.id,
		);
		const customizedEntityView = await autumnV2_2.entities.get<ApiEntityV2>(
			customerId,
			customizedEntity.id,
		);

		expect(plainEntityView.balances[TestFeature.Words]?.remaining).toBe(
			ADDED_WORKFLOWS,
		);
		expect(customizedEntityView.balances[TestFeature.Words]).toBeUndefined();
	},
);

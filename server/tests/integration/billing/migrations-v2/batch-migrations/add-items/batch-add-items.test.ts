/**
 * Batch-operations lane: add_items across several customers on a free plan.
 *
 * Contract under test:
 *   - An eligible add_items migration (no_billing_changes, free entitlements)
 *     converges every filter-matched customer: boolean flag + static balance.
 *   - A customer who attached with the items customized (is_custom product)
 *     is marked skipped and their items are NOT touched — no duplicate adds,
 *     custom amounts preserved.
 *   - Plain customers' item runs are marked succeeded; products stay active.
 */

import { test } from "bun:test";
import { type ApiCustomerV5, MigrationItemRunStatus } from "@autumn/shared";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { expectFlagCorrect } from "@tests/integration/utils/expectFlagCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { runChunkedMigration } from "../../utils/runChunkedMigration";
import { expectMigrationItemRunStatus } from "../batchTestUtils";

test.concurrent(
	`${chalk.yellowBright("batch migration: adds boolean + static entitlements across customers on a free plan")}`,
	async () => {
		const plainIds = ["batch-add-items-first", "batch-add-items-second"];
		const customId = "batch-add-items-custom";
		const [firstId, secondId] = plainIds;
		const freePlan = products.base({ id: "batch-add-items-free", items: [] });
		const customWorkflows = 25;

		const { autumnV2_2, ctx } = await initScenario({
			customerId: firstId,
			setup: [
				s.customer(),
				s.otherCustomers([{ id: secondId }, { id: customId }]),
				s.products({ list: [freePlan] }),
			],
			actions: [
				s.parallel(
					s.billing.attach({ productId: freePlan.id }),
					s.billing.attach({ customerId: secondId, productId: freePlan.id }),
					s.billing.attach({
						customerId: customId,
						productId: freePlan.id,
						items: [
							items.dashboard(),
							items.freeAllocatedWorkflows({ includedUsage: customWorkflows }),
						],
					}),
				),
			],
		});

		const { migration, migrationRunId } = await runChunkedMigration({
			ctx,
			migrationClient: autumnV2_2,
			migrationId: "batch-add-items-mig",
			filter: { customer: { plan: { plan_id: freePlan.id } } },
			operations: {
				customer: [
					{
						type: "update_plan",
						plan_filter: { plan_id: freePlan.id },
						customize: {
							add_items: [
								itemsV2.dashboard(),
								{ feature_id: TestFeature.Workflows, included: 10 },
							],
						},
					},
				],
			},
			noBillingChanges: true,
		});

		const expectItemRunStatus = ({
			customerId,
			status,
		}: {
			customerId: string;
			status: MigrationItemRunStatus;
		}) =>
			expectMigrationItemRunStatus({
				ctx,
				migrationInternalId: migration.internal_id,
				migrationRunId,
				customerId,
				status,
			});

		for (const customerId of plainIds) {
			const customer =
				await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
			await expectCustomerProducts({ customer, active: [freePlan.id] });
			expectFlagCorrect({
				customer,
				featureId: TestFeature.Dashboard,
				planId: freePlan.id,
			});
			expectBalanceCorrect({
				customer,
				featureId: TestFeature.Workflows,
				remaining: 10,
				usage: 0,
				planId: freePlan.id,
			});
			await expectItemRunStatus({
				customerId,
				status: MigrationItemRunStatus.Succeeded,
			});
		}

		// The customized customer is outside the batch lane's authority: skipped,
		// items untouched — custom amount preserved, no duplicate workflows row.
		const customCustomer =
			await autumnV2_2.customers.get<ApiCustomerV5>(customId);
		await expectCustomerProducts({
			customer: customCustomer,
			active: [freePlan.id],
		});
		expectFlagCorrect({
			customer: customCustomer,
			featureId: TestFeature.Dashboard,
			planId: freePlan.id,
		});
		expectBalanceCorrect({
			customer: customCustomer,
			featureId: TestFeature.Workflows,
			remaining: customWorkflows,
			usage: 0,
			planId: freePlan.id,
			breakdownCount: 1,
		});
		await expectItemRunStatus({
			customerId: customId,
			status: MigrationItemRunStatus.Skipped,
		});
	},
);

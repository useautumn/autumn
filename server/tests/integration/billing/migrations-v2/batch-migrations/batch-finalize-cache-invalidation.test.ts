/**
 * Batch finalize: cache invalidation contract.
 *
 * The check/balance path serves from cached FullSubject state, so this test
 * PRIMES the caches before the migration (pre-migration reads) — without
 * priming, the first read lands after the migration and a broken finalize
 * would go undetected. Contract:
 *   - pre-migration checks: features absent (and now cached);
 *   - after an add_items batch migration, the SAME reads reflect the new
 *     boolean flag and metered balance — proving the page finalize
 *     invalidated fullCustomer + FullSubject caches;
 *   - item runs are marked succeeded.
 */

import { expect, test } from "bun:test";
import {
	type ApiCustomerV5,
	type CheckResponseV3,
	MigrationItemRunStatus,
} from "@autumn/shared";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { expectFlagCorrect } from "@tests/integration/utils/expectFlagCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { runChunkedMigration } from "../utils/runChunkedMigration";
import { expectMigrationItemRunStatus } from "./batchTestUtils";

test.concurrent(
	`${chalk.yellowBright("batch migration finalize: primed caches serve post-migration state")}`,
	async () => {
		const customerId = "batch-finalize-cache";
		const freePlan = products.base({
			id: "batch-finalize-cache-free",
			items: [],
		});

		const { autumnV2_1, autumnV2_2, ctx } = await initScenario({
			customerId,
			setup: [s.customer(), s.products({ list: [freePlan] })],
			actions: [s.billing.attach({ productId: freePlan.id })],
		});

		// PRIME: these reads cache the pre-migration state.
		const flagBefore = await autumnV2_1.check<CheckResponseV3>({
			customer_id: customerId,
			feature_id: TestFeature.Dashboard,
		});
		expect(flagBefore.allowed).toBe(false);
		const balanceBefore = await autumnV2_1.check<CheckResponseV3>({
			customer_id: customerId,
			feature_id: TestFeature.Workflows,
		});
		expect(balanceBefore.allowed).toBe(false);
		await autumnV2_2.customers.get<ApiCustomerV5>(customerId);

		const { migration, migrationRunId } = await runChunkedMigration({
			ctx,
			migrationClient: autumnV2_2,
			migrationId: "batch-finalize-cache-mig",
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

		// The SAME cached reads must now serve the migrated state.
		const flagAfter = await autumnV2_1.check<CheckResponseV3>({
			customer_id: customerId,
			feature_id: TestFeature.Dashboard,
		});
		expect(flagAfter.allowed).toBe(true);
		const balanceAfter = await autumnV2_1.check<CheckResponseV3>({
			customer_id: customerId,
			feature_id: TestFeature.Workflows,
		});
		expect(balanceAfter.allowed).toBe(true);
		expect(balanceAfter.balance?.remaining).toBe(10);

		const customer = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
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
		await expectMigrationItemRunStatus({
			ctx,
			migrationInternalId: migration.internal_id,
			migrationRunId,
			customerId,
			status: MigrationItemRunStatus.Succeeded,
		});
	},
);

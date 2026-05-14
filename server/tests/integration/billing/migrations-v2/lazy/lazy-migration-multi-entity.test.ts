/**
 * TDD test for Phase 2 lazy migrations — multi-entity customers.
 *
 * Contract under test:
 *   - When a customer has multiple entities on the same plan and the
 *     lazy migration filter matches the customer (not entity-specific),
 *     concurrent entity-scoped fetches must NOT cause double execution.
 *   - The migration's `migration_item_runs` row is keyed by customer,
 *     not entity, so even with N entities only one row should exist
 *     for the customer after migration.
 *   - After the migration completes, every entity returns post-migration
 *     state on subsequent fetches.
 *   - When entities each have their own (free) attached plan, migrating
 *     that plan touches BOTH entity-scoped customer_products through one
 *     customer-level item_run.
 */

import { expect, test } from "bun:test";
import {
	type ApiCustomerV5,
	MigrationItemRunStatus,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import {
	countCustomerItemRunRows,
	getCustomerAndAwaitMigration,
	getInternalCustomerId,
	releaseLazyMigrationRun,
	startLazyMigration,
	waitForCustomerItemRunStatus,
} from "./utils/lazyMigrationTestUtils.js";

test.concurrent(
	`${chalk.yellowBright("lazy migration multi-entity: concurrent entity fetches still migrate the customer exactly once")}`,
	async () => {
		const customerId = "lazy-multi-entity";
		const plan = products.pro({ id: "lazy-multi-entity-pro", items: [] });

		const { autumnV2_2, ctx, entities } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [plan] }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
			],
			actions: [s.billing.attach({ productId: plan.id })],
		});

		expect(entities.length).toBe(2);
		const [firstEntity, secondEntity] = entities;
		if (!firstEntity || !secondEntity)
			throw new Error("expected 2 entities to be generated");

		const { migration, run_id } = await startLazyMigration({
			autumnV2_2,
			ctx,
			id: `${customerId}-mig`,
			planId: plan.id,
		});

		try {
			// Concurrent entity-scoped fetches. Both may enqueue their own
			// runMigrationCustomerTask — the claim must serialize them.
			await Promise.all([
				autumnV2_2.entities.get(customerId, firstEntity.id),
				autumnV2_2.entities.get(customerId, secondEntity.id),
			]);

			// Migration eventually completes for the underlying customer.
			const internalCustomerId = await getInternalCustomerId({
				customerId,
				ctx,
			});
			await waitForCustomerItemRunStatus({
				ctx,
				migration,
				internalCustomerId,
				status: MigrationItemRunStatus.Succeeded,
			});

			// Exactly one item_run row (keyed by customer, not entity).
			const rowCount = await countCustomerItemRunRows({
				ctx,
				migration,
				internalCustomerId,
			});
			expect(rowCount).toBe(1);

			// Subsequent /customers.get returns post-migration state.
			const customer = await getCustomerAndAwaitMigration({
				autumnV2_2,
				customerId,
			});
			expect(customer.flags[TestFeature.Dashboard]).toBeDefined();
		} finally {
			await releaseLazyMigrationRun({ ctx, runId: run_id });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("lazy migration multi-entity: per-entity free plans both migrated under one customer item_run")}`,
	async () => {
		const customerId = "lazy-multi-entity-free";
		const freePlan = products.base({
			id: "lazy-multi-entity-free-plan",
			items: [],
		});

		const { autumnV2_2, ctx, entities } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [freePlan] }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
			],
			actions: [
				// Attach the free plan once per entity. Each attach produces an
				// entity-scoped customer_product row (`internal_entity_id` set).
				s.billing.attach({ productId: freePlan.id, entityIndex: 0 }),
				s.billing.attach({ productId: freePlan.id, entityIndex: 1 }),
			],
		});

		expect(entities.length).toBe(2);
		const [firstEntity, secondEntity] = entities;
		if (!firstEntity || !secondEntity)
			throw new Error("expected 2 entities to be generated");

		const { migration, run_id } = await startLazyMigration({
			autumnV2_2,
			ctx,
			id: `${customerId}-mig`,
			planId: freePlan.id,
		});

		try {
			// Entity-scoped fetches surface entity-scoped customer_products in
			// FullSubject, so the helper's filter pre-check matches there. The
			// task itself loads a fresh customer-level view inside
			// `setupMigrateCustomerContext` (`withEntities: true`) and applies
			// the operation to BOTH entity-scoped plans in one execution.
			await Promise.all([
				autumnV2_2.entities.get<ApiCustomerV5>(customerId, firstEntity.id),
				autumnV2_2.entities.get<ApiCustomerV5>(customerId, secondEntity.id),
			]);

			const internalCustomerId = await getInternalCustomerId({
				customerId,
				ctx,
			});
			await waitForCustomerItemRunStatus({
				ctx,
				migration,
				internalCustomerId,
				status: MigrationItemRunStatus.Succeeded,
			});

			// ── A. Migration ran once ────────────────────────────────────────
			expect(
				await countCustomerItemRunRows({
					ctx,
					migration,
					internalCustomerId,
				}),
			).toBe(1);

			// ── B. Both entity-scoped free plans carry the migrated state ─────
			const firstEntityView = await autumnV2_2.entities.get<ApiCustomerV5>(
				customerId,
				firstEntity.id,
			);
			const secondEntityView = await autumnV2_2.entities.get<ApiCustomerV5>(
				customerId,
				secondEntity.id,
			);

			expect(firstEntityView.flags[TestFeature.Dashboard]).toBeDefined();
			expect(secondEntityView.flags[TestFeature.Dashboard]).toBeDefined();
		} finally {
			await releaseLazyMigrationRun({ ctx, runId: run_id });
		}
	},
);

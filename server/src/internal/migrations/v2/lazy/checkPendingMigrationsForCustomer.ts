import type { FullCustomer, MigrationItemRunData } from "@autumn/shared";
import { customerFilterMatchesFullCustomer } from "@autumn/shared/api/customers/utils/match/index.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { shouldRunMigrationInline } from "@/internal/migrations/v2/utils/shouldRunMigrationInline.js";
import {
	executeRunMigrationCustomer,
	runMigrationCustomerTask,
} from "@/trigger/migrations/runMigrationCustomerTask.js";

/**
 * For each pending lazy migration on `ctx.org`, decide whether this customer
 * needs migrating and enqueue a per-customer Trigger.dev task if so.
 *
 * Reads `migration_item_runs` from the already-loaded `fullCustomer` (embedded
 * by the FullSubject / FullCustomer query) — no extra DB roundtrip.
 *
 * Fire-and-forget: the helper doesn't wait for the migration to complete.
 * `executeMigrateCustomerPlan` inside the task busts the customer cache,
 * so subsequent requests read post-migration state.
 */
export const checkPendingMigrationsForCustomer = async ({
	ctx,
	fullCustomer,
}: {
	ctx: AutumnContext;
	fullCustomer: Pick<
		FullCustomer,
		"id" | "internal_id" | "customer_products" | "migration_item_runs"
	>;
}): Promise<void> => {
	// Short-circuit when we're already inside a Trigger.dev task. A migration
	// worker loading the customer via `CusService.getFull` would otherwise
	// re-enter this helper and enqueue another task. Flag is set by
	// `createTriggerContext`.
	if (ctx.insideTriggerTask) return;

	const pending = ctx.org.pendingMigrations ?? [];
	if (pending.length === 0) return;

	const itemRunsByMigrationInternalId = new Map<string, MigrationItemRunData>();
	for (const itemRun of fullCustomer.migration_item_runs ?? []) {
		const existing = itemRunsByMigrationInternalId.get(
			itemRun.migration_internal_id,
		);
		if (
			!existing ||
			(itemRun.updated_at ?? 0) > (existing.updated_at ?? 0) ||
			(itemRun.updated_at === existing.updated_at &&
				itemRun.created_at > existing.created_at)
		) {
			itemRunsByMigrationInternalId.set(itemRun.migration_internal_id, itemRun);
		}
	}

	for (const pendingMigration of pending) {
		const { internal_id: migrationRunId, migration } = pendingMigration;

		const matches = customerFilterMatchesFullCustomer({
			filter: migration.filter?.customer ?? {},
			fullCustomer,
		});
		if (!matches) continue;

		const itemRun = itemRunsByMigrationInternalId.get(migration.internal_id);
		if (
			itemRun?.status === "succeeded" ||
			itemRun?.status === "skipped" ||
			itemRun?.status === "running"
		) {
			continue;
		}

		const payload = {
			orgId: ctx.org.id,
			env: ctx.env,
			migrationInternalId: migration.internal_id,
			migrationRunId,
			customerInternalId: fullCustomer.internal_id,
			customerId: fullCustomer.id ?? null,
		};

		if (shouldRunMigrationInline()) {
			const inlineCtx = { ...ctx, insideTriggerTask: true };
			void executeRunMigrationCustomer({
				ctx: inlineCtx,
				logger: ctx.logger,
				payload,
			}).catch((error) => {
				ctx.logger.error("lazy-migration: inline execution failed", {
					data: {
						migrationRunId,
						error: error instanceof Error ? error.message : String(error),
					},
				});
			});
			continue;
		}

		await runMigrationCustomerTask.trigger(payload);
	}
};

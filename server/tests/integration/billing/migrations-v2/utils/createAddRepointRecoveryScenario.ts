import { migrationItemRuns, migrations } from "@autumn/shared";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import { and, eq, inArray } from "drizzle-orm";
import { withMigrationRunClaim } from "@/internal/migrations/v2/actions/migrationRun/withMigrationRunClaim.js";
import { batchMigrationPlanToExecutionPlan } from "@/internal/migrations/v2/batchOperations/compute/index.js";
import { claimNextBatchMigrationPage } from "@/internal/migrations/v2/batchOperations/execute/claim/claimNextBatchMigrationPage.js";
import { prepareMigration } from "@/internal/migrations/v2/run/runMigration.js";
import { shouldRunBatchLane } from "@/internal/migrations/v2/utils/shouldRunBatchLane.js";

export const createAddRepointRecoveryScenario = async ({
	customerId = "add-repoint-recovery",
	customerCount = 1,
}: {
	customerId?: string;
	customerCount?: number;
} = {}) => {
	const otherCustomerIds = Array.from(
		{ length: customerCount - 1 },
		(_, index) => `${customerId}-${index + 2}`,
	);
	const product = products.base({ id: "recovery-plan", items: [] });
	const { ctx, autumnV2_3 } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: false, skipWebhooks: true }),
			s.otherCustomers(otherCustomerIds.map((id) => ({ id }))),
			s.products({ list: [product] }),
		],
		actions: [
			s.billing.attach({ productId: product.id }),
			...otherCustomerIds.map((customerId) =>
				s.billing.attach({ customerId, productId: product.id }),
			),
		],
	});
	await autumnV2_3.post("/plans.update", {
		plan_id: product.id,
		force_version: true,
		items: [],
	});
	// Production preserves customer run history; reset only this fixture's own claims.
	await ctx.db.delete(migrationItemRuns).where(
		inArray(
			migrationItemRuns.migration_internal_id,
			ctx.db
				.select({ internalId: migrations.internal_id })
				.from(migrations)
				.where(
					and(
						eq(migrations.org_id, ctx.org.id),
						eq(migrations.env, ctx.env),
						eq(migrations.id, customerId),
					),
				),
		),
	);
	const migration = await autumnV2_3.migrationsV2.deleteAndCreate({
		id: customerId,
		filter: {
			customer: { plan: { plan_id: product.id, version: 1 } },
		},
		operations: {
			customer: [
				{
					type: "update_plan",
					plan_filter: { plan_id: product.id, version: 1, custom: false },
					version: 2,
					customize: { add_items: [itemsV2.dashboard()] },
				},
			],
		},
		no_billing_changes: true,
	});
	const preparedMigration = await prepareMigration({
		ctx,
		migration,
		dryRun: false,
	});
	const { migrationRunId } = await withMigrationRunClaim({
		ctx,
		migration,
		dryRun: false,
		claimed: async () => undefined,
	});
	const batchLane = await shouldRunBatchLane({
		ctx,
		migration: preparedMigration,
		migrationRunId,
		dryRun: false,
		controls: undefined,
		hasCustomHooks: false,
		hasCloudBatchAdapter: false,
	});
	if (!batchLane.shouldRun)
		throw new Error("Expected add-and-repoint migration to use the batch lane");
	const page = await claimNextBatchMigrationPage({
		ctx,
		migration: preparedMigration,
		migrationInternalId: migration.internal_id,
		migrationRunId,
		limit: 10,
	});
	return {
		autumnV2_3,
		customerId,
		planId: product.id,
		pageInput: {
			ctx,
			migrationInternalId: migration.internal_id,
			migrationRunId,
			plan: batchMigrationPlanToExecutionPlan({ plan: batchLane.plan }),
			customers: page.customers,
		},
	};
};

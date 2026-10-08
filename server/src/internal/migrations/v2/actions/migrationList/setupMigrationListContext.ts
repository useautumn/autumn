import type { Migration } from "@autumn/shared";
import pLimit from "p-limit";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { migrationItemRunRepo } from "../../repos/index.js";
import { countCustomersCached } from "../countCustomersCached.js";
import { setupMigrationRunState } from "../migrationStatus/setupMigrationRunState.js";
import { listMigrationProducts } from "./listMigrationProducts.js";
import type { MigrationListContext } from "./types/migrationListContext.js";

const CUSTOMER_COUNT_CONCURRENCY = 4;

const countMatchedCustomers = async ({
	ctx,
	migration,
}: {
	ctx: AutumnContext;
	migration: Migration;
}): Promise<number | null> => {
	const filter = migration.filter?.customer;
	const hasFilter =
		filter !== undefined &&
		Object.values(filter).some((value) => value !== undefined);
	if (migration.archived || !hasFilter) return null;

	try {
		return await countCustomersCached({
			ctx,
			filter,
			includeProcessed: { migrationInternalId: migration.internal_id },
			cacheScope: {
				migrationId: migration.id,
				source: "filter",
				executionStatuses: [],
			},
		});
	} catch (error) {
		ctx.logger.warn(`Migration ${migration.id} customer count failed`, {
			error,
		});
		return null;
	}
};

const listCustomerCounts = async ({
	ctx,
	migrations,
}: {
	ctx: AutumnContext;
	migrations: Migration[];
}): Promise<Map<string, number | null>> => {
	const limit = pLimit(CUSTOMER_COUNT_CONCURRENCY);
	const counts = await Promise.all(
		migrations.map((migration) =>
			limit(() => countMatchedCustomers({ ctx, migration })),
		),
	);
	return new Map(
		migrations.map((migration, index) => [
			migration.internal_id,
			counts[index],
		]),
	);
};

const setupRunsWithItemCounts = async ({
	ctx,
	migrationInternalIds,
}: {
	ctx: AutumnContext;
	migrationInternalIds: string[];
}) => {
	const runState = await setupMigrationRunState({ ctx, migrationInternalIds });
	const itemRunCounts = await migrationItemRunRepo.listCountRows({
		ctx,
		migrationInternalIds,
		dryRunIds: runState.latestRuns
			.filter((run) => run.kind === "dry_run")
			.map((run) => run.internal_id),
	});
	return { ...runState, itemRunCounts };
};

/** Every read the list needs, batched per org rather than per migration. */
export const setupMigrationListContext = async ({
	ctx,
	migrations,
}: {
	ctx: AutumnContext;
	migrations: Migration[];
}): Promise<MigrationListContext> => {
	const [runsWithItemCounts, customerCounts, products] = await Promise.all([
		setupRunsWithItemCounts({
			ctx,
			migrationInternalIds: migrations.map(
				(migration) => migration.internal_id,
			),
		}),
		listCustomerCounts({ ctx, migrations }),
		listMigrationProducts({ ctx, migrations }),
	]);

	return { migrations, ...runsWithItemCounts, customerCounts, products };
};

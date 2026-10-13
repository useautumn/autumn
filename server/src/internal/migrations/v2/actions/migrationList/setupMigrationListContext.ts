import type { Migration } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { migrationItemRunRepo } from "../../repos/index.js";
import { setupMigrationRunState } from "../migrationStatus/setupMigrationRunState.js";
import { listMigrationCustomerCounts } from "./listMigrationCustomerCounts.js";
import { listMigrationProducts } from "./listMigrationProducts.js";
import type { MigrationListContext } from "./types/migrationListContext.js";

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

/** Every read the list needs, batched per org rather than per migration.
 * Customer counts dominate on large orgs, so callers may defer them. */
export const setupMigrationListContext = async ({
	ctx,
	migrations,
	includeCustomerCounts = true,
}: {
	ctx: AutumnContext;
	migrations: Migration[];
	includeCustomerCounts?: boolean;
}): Promise<MigrationListContext> => {
	const [runsWithItemCounts, customerCounts, products] = await Promise.all([
		setupRunsWithItemCounts({
			ctx,
			migrationInternalIds: migrations.map(
				(migration) => migration.internal_id,
			),
		}),
		includeCustomerCounts
			? listMigrationCustomerCounts({ ctx, migrations })
			: new Map<string, number | null>(),
		listMigrationProducts({ ctx, migrations }),
	]);

	return { migrations, ...runsWithItemCounts, customerCounts, products };
};

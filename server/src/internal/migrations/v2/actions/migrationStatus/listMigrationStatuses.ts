import type { Migration, MigrationRun, MigrationStatus } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { migrationRepo, migrationRunRepo } from "../../repos/index.js";
import { resolveMigrationStatus } from "./resolveMigrationStatus.js";

export type MigrationStatusInfo = {
	status: MigrationStatus;
	blocked_by: string | null;
};

type MigrationRef = Pick<Migration, "internal_id" | "id">;

const resolveBlockerSlug = async ({
	ctx,
	blockerInternalId,
	knownMigrations,
}: {
	ctx: AutumnContext;
	blockerInternalId: string;
	knownMigrations: MigrationRef[];
}): Promise<string> => {
	const known = knownMigrations.find(
		(migration) => migration.internal_id === blockerInternalId,
	);
	if (known) return known.id;
	const [blocker] = await migrationRepo.get({
		ctx,
		internalId: blockerInternalId,
	});
	return blocker?.id ?? blockerInternalId;
};

/** Computes draft/waiting/running/run for each migration from two queries:
 * the org's active runs and a per-migration Run All history summary. */
export const listMigrationStatuses = async ({
	ctx,
	migrations,
}: {
	ctx: AutumnContext;
	migrations: MigrationRef[];
}): Promise<Map<string, MigrationStatusInfo>> => {
	if (migrations.length === 0) return new Map();

	const migrationInternalIds = migrations.map((m) => m.internal_id);
	const [orgActiveRuns, summaries] = await Promise.all([
		migrationRunRepo.list({ ctx, active: true }),
		migrationRunRepo.listRunAllSummaries({ ctx, migrationInternalIds }),
	]);

	const activeRunsByMigration = new Map<string, MigrationRun[]>();
	for (const run of orgActiveRuns) {
		const runs = activeRunsByMigration.get(run.migration_internal_id) ?? [];
		runs.push(run);
		activeRunsByMigration.set(run.migration_internal_id, runs);
	}

	const statuses = new Map<string, MigrationStatusInfo>();
	for (const migration of migrations) {
		const resolved = resolveMigrationStatus({
			migrationInternalId: migration.internal_id,
			runs: activeRunsByMigration.get(migration.internal_id) ?? [],
			orgActiveRuns,
			hasStartedRunAll:
				summaries.get(migration.internal_id)?.has_started_run_all ?? false,
		});
		statuses.set(migration.internal_id, {
			status: resolved.status,
			blocked_by: resolved.blockedByMigrationInternalId
				? await resolveBlockerSlug({
						ctx,
						blockerInternalId: resolved.blockedByMigrationInternalId,
						knownMigrations: migrations,
					})
				: null,
		});
	}

	return statuses;
};

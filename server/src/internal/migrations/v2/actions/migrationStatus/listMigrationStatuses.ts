import type { Migration, MigrationStatus } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { migrationRepo, migrationRunRepo } from "../../repos/index.js";
import { resolveMigrationStatus } from "./resolveMigrationStatus.js";

type MigrationRef = Pick<Migration, "internal_id" | "id">;
type MigrationStatusInfo = {
	status: MigrationStatus;
	blocked_by: string | null;
};

const resolveBlockerId = async ({
	ctx,
	blockerInternalId,
	migrations,
}: {
	ctx: AutumnContext;
	blockerInternalId: string;
	migrations: MigrationRef[];
}): Promise<string> => {
	const known = migrations.find((m) => m.internal_id === blockerInternalId);
	if (known) return known.id;
	const [blocker] = await migrationRepo.get({
		ctx,
		internalId: blockerInternalId,
	});
	return blocker?.id ?? blockerInternalId;
};

export const listMigrationStatuses = async ({
	ctx,
	migrations,
}: {
	ctx: AutumnContext;
	migrations: MigrationRef[];
}): Promise<Map<string, MigrationStatusInfo>> => {
	if (migrations.length === 0) return new Map();

	const [orgActiveRuns, startedRunAllIds] = await Promise.all([
		migrationRunRepo.list({ ctx, active: true }),
		migrationRunRepo.listIdsWithRunAllStarted({
			ctx,
			migrationInternalIds: migrations.map((m) => m.internal_id),
		}),
	]);

	const statuses = new Map<string, MigrationStatusInfo>();
	for (const migration of migrations) {
		const { status, blockedByMigrationInternalId } = resolveMigrationStatus({
			migrationInternalId: migration.internal_id,
			runs: orgActiveRuns.filter(
				(run) => run.migration_internal_id === migration.internal_id,
			),
			orgActiveRuns,
			hasStartedRunAll: startedRunAllIds.has(migration.internal_id),
		});
		statuses.set(migration.internal_id, {
			status,
			blocked_by: blockedByMigrationInternalId
				? await resolveBlockerId({
						ctx,
						blockerInternalId: blockedByMigrationInternalId,
						migrations,
					})
				: null,
		});
	}

	return statuses;
};

import {
	type MigrationItemKind,
	type MigrationItemRun,
	MigrationItemRunStatus,
	type MigrationItemRunStatus as MigrationItemRunStatusType,
	migrationItemRuns,
} from "@autumn/shared";
import { sql } from "drizzle-orm";
import type { RepoContext } from "@/db/repoContext.js";
import { generateId } from "@/utils/genUtils.js";

type MigrationItemRunRepoContext = RepoContext & {
	dbGeneral?: RepoContext["db"];
};

const markMigrationItemRun = async ({
	ctx,
	migrationInternalId,
	migrationRunId,
	dryRun = false,
	itemKind,
	itemId,
	status,
}: {
	ctx: MigrationItemRunRepoContext;
	migrationInternalId: string;
	migrationRunId?: string;
	dryRun?: boolean;
	itemKind: MigrationItemKind;
	itemId: string;
	status: MigrationItemRunStatusType;
}): Promise<MigrationItemRun | null> => {
	if (dryRun && !migrationRunId)
		throw new Error(
			"migrationItemRunRepo.mark: dryRun requires migrationRunId",
		);

	const now = Date.now();
	const target = dryRun
		? [
				migrationItemRuns.migration_internal_id,
				migrationItemRuns.migration_run_id,
				migrationItemRuns.item_kind,
				migrationItemRuns.item_id,
			]
		: [
				migrationItemRuns.migration_internal_id,
				migrationItemRuns.item_kind,
				migrationItemRuns.item_id,
			];
	const targetWhere = dryRun
		? sql`${migrationItemRuns.dry_run} = true`
		: sql`${migrationItemRuns.dry_run} = false`;

	const [row] = await (ctx.dbGeneral ?? ctx.db)
		.insert(migrationItemRuns)
		.values({
			migration_item_run_id: generateId("mir"),
			migration_internal_id: migrationInternalId,
			migration_run_id: migrationRunId ?? null,
			dry_run: dryRun,
			item_kind: itemKind,
			item_id: itemId,
			status,
			created_at: now,
			updated_at: now,
		})
		.onConflictDoUpdate({
			target,
			targetWhere,
			set: { status, updated_at: now },
		})
		.returning();

	return row ?? null;
};

export const markMigrationItemRunSucceeded = async (
	params: Omit<Parameters<typeof markMigrationItemRun>[0], "status">,
): Promise<MigrationItemRun | null> =>
	markMigrationItemRun({
		...params,
		status: MigrationItemRunStatus.Succeeded,
	});

export const markMigrationItemRunSkipped = async (
	params: Omit<Parameters<typeof markMigrationItemRun>[0], "status">,
): Promise<MigrationItemRun | null> =>
	markMigrationItemRun({
		...params,
		status: MigrationItemRunStatus.Skipped,
	});

export const markMigrationItemRunFailed = async (
	params: Omit<Parameters<typeof markMigrationItemRun>[0], "status">,
): Promise<MigrationItemRun | null> =>
	markMigrationItemRun({
		...params,
		status: MigrationItemRunStatus.Failed,
	});

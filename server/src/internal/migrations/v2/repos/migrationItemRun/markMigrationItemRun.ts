import {
	type MigrationItemKind,
	type MigrationItemRun,
	MigrationItemRunStatus,
	type MigrationItemRunStatus as MigrationItemRunStatusType,
	migrationItemRuns,
} from "@autumn/shared";
import { and, eq } from "drizzle-orm";
import type { RepoContext } from "@/db/repoContext.js";

const markMigrationItemRun = async ({
	ctx,
	migrationInternalId,
	itemKind,
	itemId,
	status,
}: {
	ctx: RepoContext;
	migrationInternalId: string;
	itemKind: MigrationItemKind;
	itemId: string;
	status: MigrationItemRunStatusType;
}): Promise<MigrationItemRun | null> => {
	const [row] = await ctx.db
		.update(migrationItemRuns)
		.set({ status, updated_at: Date.now() })
		.where(
			and(
				eq(migrationItemRuns.migration_internal_id, migrationInternalId),
				eq(migrationItemRuns.item_kind, itemKind),
				eq(migrationItemRuns.item_id, itemId),
			),
		)
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

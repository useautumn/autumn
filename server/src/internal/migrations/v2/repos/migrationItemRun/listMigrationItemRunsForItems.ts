import {
	type MigrationItemKind,
	type MigrationItemRun,
	migrationItemRuns,
} from "@autumn/shared";
import { and, eq, inArray } from "drizzle-orm";
import type { RepoContext } from "@/db/repoContext.js";

export const listMigrationItemRunsForItems = async ({
	ctx,
	migrationInternalId,
	itemKind,
	itemIds,
	dryRun,
}: {
	ctx: RepoContext;
	migrationInternalId: string;
	itemKind: MigrationItemKind;
	itemIds: string[];
	dryRun?: boolean;
}): Promise<MigrationItemRun[]> => {
	if (itemIds.length === 0) return [];

	return ctx.db
		.select()
		.from(migrationItemRuns)
		.where(
			and(
				eq(migrationItemRuns.migration_internal_id, migrationInternalId),
				eq(migrationItemRuns.item_kind, itemKind),
				inArray(migrationItemRuns.item_id, itemIds),
				...(dryRun === undefined
					? []
					: [eq(migrationItemRuns.dry_run, dryRun)]),
			),
		);
};

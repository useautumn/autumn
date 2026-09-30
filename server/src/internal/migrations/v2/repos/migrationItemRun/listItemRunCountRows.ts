import {
	MigrationItemKind,
	type MigrationItemRunSkipReason,
	type MigrationItemRunStatus,
	migrationItemRuns,
} from "@autumn/shared";
import { and, eq, inArray, or, sql } from "drizzle-orm";
import type { RepoContext } from "@/db/repoContext.js";

export type MigrationItemRunCountRow = {
	migration_internal_id: string;
	migration_run_id: string | null;
	dry_run: boolean;
	status: MigrationItemRunStatus;
	skip_reason: MigrationItemRunSkipReason | null;
	count: number;
};

/** Customer item-run counts for every live item of the migrations plus every
 * item of `dryRunIds`; each OR branch matches one partial index on `dry_run`. */
export const listItemRunCountRows = async ({
	ctx,
	migrationInternalIds,
	dryRunIds,
}: {
	ctx: RepoContext;
	migrationInternalIds: string[];
	dryRunIds: string[];
}): Promise<MigrationItemRunCountRow[]> => {
	if (migrationInternalIds.length === 0) return [];

	const isLiveItem = eq(migrationItemRuns.dry_run, false);
	const isListedDryRunItem =
		dryRunIds.length > 0
			? and(
					eq(migrationItemRuns.dry_run, true),
					inArray(migrationItemRuns.migration_run_id, dryRunIds),
				)
			: undefined;

	return ctx.db
		.select({
			migration_internal_id: migrationItemRuns.migration_internal_id,
			migration_run_id: migrationItemRuns.migration_run_id,
			dry_run: migrationItemRuns.dry_run,
			status: migrationItemRuns.status,
			skip_reason: migrationItemRuns.skip_reason,
			count: sql<number>`count(*)::int`,
		})
		.from(migrationItemRuns)
		.where(
			and(
				eq(migrationItemRuns.item_kind, MigrationItemKind.Customer),
				inArray(migrationItemRuns.migration_internal_id, migrationInternalIds),
				or(isLiveItem, isListedDryRunItem),
			),
		)
		.groupBy(
			migrationItemRuns.migration_internal_id,
			migrationItemRuns.migration_run_id,
			migrationItemRuns.dry_run,
			migrationItemRuns.status,
			migrationItemRuns.skip_reason,
		);
};

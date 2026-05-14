import { MigrationItemKind, type MigrationItemRun } from "@autumn/shared";
import { and, eq } from "drizzle-orm";
import type { RepoContext } from "@/db/repoContext.js";

export const getMigrationItemRun = async ({
	ctx,
	migrationInternalId,
	migrationRunId,
	dryRun = false,
	itemKind,
	itemId,
}: {
	ctx: RepoContext;
	migrationInternalId: string;
	migrationRunId?: string;
	dryRun?: boolean;
	itemKind: MigrationItemKind;
	itemId: string;
}): Promise<MigrationItemRun | null> => {
	if (dryRun && !migrationRunId)
		throw new Error("migrationItemRunRepo.get: dryRun requires migrationRunId");

	const row = await ctx.db.query.migrationItemRuns.findFirst({
		where: (r) =>
			and(
				eq(r.migration_internal_id, migrationInternalId),
				eq(r.dry_run, dryRun),
				...(dryRun && migrationRunId
					? [eq(r.migration_run_id, migrationRunId)]
					: []),
				eq(r.item_kind, itemKind),
				eq(r.item_id, itemId),
			),
	});

	return row ?? null;
};

export const getCustomerMigrationItemRun = async ({
	ctx,
	migrationInternalId,
	migrationRunId,
	dryRun,
	internalCustomerId,
}: {
	ctx: RepoContext;
	migrationInternalId: string;
	migrationRunId?: string;
	dryRun?: boolean;
	internalCustomerId: string;
}): Promise<MigrationItemRun | null> =>
	getMigrationItemRun({
		ctx,
		migrationInternalId,
		migrationRunId,
		dryRun,
		itemKind: MigrationItemKind.Customer,
		itemId: internalCustomerId,
	});

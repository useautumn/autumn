import { MigrationItemKind, type MigrationItemRun } from "@autumn/shared";
import { and, eq } from "drizzle-orm";
import type { RepoContext } from "@/db/repoContext.js";

export const getMigrationItemRun = async ({
	ctx,
	migrationInternalId,
	itemKind,
	itemId,
}: {
	ctx: RepoContext;
	migrationInternalId: string;
	itemKind: MigrationItemKind;
	itemId: string;
}): Promise<MigrationItemRun | null> => {
	const row = await ctx.db.query.migrationItemRuns.findFirst({
		where: (r) =>
			and(
				eq(r.migration_internal_id, migrationInternalId),
				eq(r.item_kind, itemKind),
				eq(r.item_id, itemId),
			),
	});

	return row ?? null;
};

export const getCustomerMigrationItemRun = async ({
	ctx,
	migrationInternalId,
	internalCustomerId,
}: {
	ctx: RepoContext;
	migrationInternalId: string;
	internalCustomerId: string;
}): Promise<MigrationItemRun | null> =>
	getMigrationItemRun({
		ctx,
		migrationInternalId,
		itemKind: MigrationItemKind.Customer,
		itemId: internalCustomerId,
	});

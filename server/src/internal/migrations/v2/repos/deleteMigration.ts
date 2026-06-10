import {
	ErrCode,
	type Migration,
	MigrationItemKind,
	migrationItemRuns,
	migrations,
	RecaseError,
} from "@autumn/shared";
import { and, eq } from "drizzle-orm";
import type { RepoContext } from "@/db/repoContext.js";

/** Delete by user `id`, scoped to the current org + env. */
export const deleteMigration = async ({
	ctx,
	id,
}: {
	ctx: RepoContext;
	id: string;
}): Promise<Migration | null> => {
	const [migration] = await ctx.db
		.select()
		.from(migrations)
		.where(
			and(
				eq(migrations.id, id),
				eq(migrations.org_id, ctx.org.id),
				eq(migrations.env, ctx.env),
				eq(migrations.archived, false),
			),
		)
		.limit(1);

	if (!migration) return null;

	const [customerRun] = await ctx.db
		.select({ id: migrationItemRuns.migration_item_run_id })
		.from(migrationItemRuns)
		.where(
			and(
				eq(migrationItemRuns.migration_internal_id, migration.internal_id),
				eq(migrationItemRuns.item_kind, MigrationItemKind.Customer),
				eq(migrationItemRuns.dry_run, false),
			),
		)
		.limit(1);

	if (customerRun) {
		throw new RecaseError({
			message: `Migration ${id} has customer run history and cannot be deleted. Archive it instead.`,
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}

	const [row] = await ctx.db
		.delete(migrations)
		.where(eq(migrations.internal_id, migration.internal_id))
		.returning();
	if (row) {
		await ctx.db
			.delete(migrationItemRuns)
			.where(eq(migrationItemRuns.migration_internal_id, row.internal_id));
	}
	return row ?? null;
};

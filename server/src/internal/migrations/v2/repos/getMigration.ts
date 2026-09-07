import { type Migration, migrations } from "@autumn/shared";
import { and, desc, eq, type SQL } from "drizzle-orm";
import type { RepoContext } from "@/db/repoContext.js";

/**
 * Fetch migrations matching any combination of filter fields. Always
 * returns an array; callers expecting a single row take `[0] ?? null`.
 * Org + env scope is enforced via `ctx`.
 */
export const getMigration = async ({
	ctx,
	id,
	internalId,
	archived,
}: {
	ctx: RepoContext;
	id?: string;
	internalId?: string;
	archived?: boolean;
}): Promise<Migration[]> => {
	const where: SQL[] = [
		eq(migrations.org_id, ctx.org.id),
		eq(migrations.env, ctx.env),
	];
	if (id !== undefined) where.push(eq(migrations.id, id));
	if (internalId !== undefined)
		where.push(eq(migrations.internal_id, internalId));
	if (archived !== undefined) where.push(eq(migrations.archived, archived));

	return ctx.db
		.select()
		.from(migrations)
		.where(and(...where))
		.orderBy(desc(migrations.created_at));
};

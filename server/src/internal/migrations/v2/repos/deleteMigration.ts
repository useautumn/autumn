import { type Migration, migrations } from "@autumn/shared";
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
	const [row] = await ctx.db
		.delete(migrations)
		.where(
			and(
				eq(migrations.id, id),
				eq(migrations.org_id, ctx.org.id),
				eq(migrations.env, ctx.env),
			),
		)
		.returning();
	return row ?? null;
};

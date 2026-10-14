import { ErrCode, type Migration, RecaseError } from "@autumn/shared";
import { and, eq } from "drizzle-orm";
import type { RepoContext } from "@/db/repoContext.js";

export const findMigration = async ({
	ctx,
	id,
	internalId,
}: {
	ctx: RepoContext;
	id?: string;
	internalId?: string;
}): Promise<Migration> => {
	if (!id && !internalId)
		throw new Error("findMigration: pass either `id` or `internalId`");

	const row = await ctx.db.query.migrations.findFirst({
		where: (m) =>
			and(
				eq(m.org_id, ctx.org.id),
				eq(m.env, ctx.env),
				eq(m.archived, false),
				id !== undefined ? eq(m.id, id) : eq(m.internal_id, internalId!),
			),
	});

	if (!row)
		throw new RecaseError({
			message: `Migration ${id ?? internalId} not found`,
			code: ErrCode.MigrationNotFound,
			statusCode: 404,
		});

	return row;
};

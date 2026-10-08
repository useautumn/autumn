import { desc, isNull } from "drizzle-orm";
import { qaEnvs } from "../../../db/schema/qaEnvs.ts";
import type { TwdContext } from "../../../lib/types/twdContext.ts";
import { requireQaEnvRow } from "../repos/qaEnvsRepo.ts";
import { toQaEnv } from "./toQaEnv.ts";

export const listQaEnvs = async ({
	ctx,
	includeDeleted = false,
}: {
	ctx: TwdContext;
	includeDeleted?: boolean;
}) => {
	const rows = await ctx.db
		.select()
		.from(qaEnvs)
		.where(includeDeleted ? undefined : isNull(qaEnvs.deletedAt))
		.orderBy(desc(qaEnvs.updatedAt))
		.limit(200);
	return Promise.all(rows.map((row) => toQaEnv({ ctx, row })));
};

export const getQaEnv = async ({
	ctx,
	name,
}: {
	ctx: TwdContext;
	name: string;
}) => toQaEnv({ ctx, row: await requireQaEnvRow({ ctx, name }) });

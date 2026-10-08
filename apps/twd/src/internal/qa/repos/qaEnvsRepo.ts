import { eq } from "drizzle-orm";
import { qaEnvs } from "../../../db/schema/qaEnvs.ts";
import { TwdError } from "../../../http/apiError.ts";
import type { TwdContext } from "../../../lib/types/twdContext.ts";

export const getQaEnvRow = async ({
	ctx,
	name,
}: {
	ctx: TwdContext;
	name: string;
}) =>
	(await ctx.db.select().from(qaEnvs).where(eq(qaEnvs.name, name)).limit(1))[0];

export const requireQaEnvRow = async ({
	ctx,
	name,
}: {
	ctx: TwdContext;
	name: string;
}) => {
	const row = await getQaEnvRow({ ctx, name });
	if (!row)
		throw new TwdError({
			status: 404,
			code: "qa_env_not_found",
			message: `No QA env named ${name}.`,
			next: "List envs with qa_list (GET /api/qa).",
		});
	return row;
};

export const updateQaEnvRow = ({
	ctx,
	name,
	set,
}: {
	ctx: TwdContext;
	name: string;
	set: Partial<typeof qaEnvs.$inferInsert>;
}) =>
	ctx.db
		.update(qaEnvs)
		.set({ ...set, updatedAt: new Date() })
		.where(eq(qaEnvs.name, name));

export type QaEnvRow = typeof qaEnvs.$inferSelect;

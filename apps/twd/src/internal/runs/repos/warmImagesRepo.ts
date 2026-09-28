import { eq, inArray } from "drizzle-orm";
import { warmImages } from "../../../db/schema/runs.ts";
import type { TwdContext } from "../../../lib/types/twdContext.ts";

export type WarmImageRow = typeof warmImages.$inferSelect;

export const getWarmImage = async ({
	ctx,
	sha,
}: {
	ctx: TwdContext;
	sha: string;
}): Promise<WarmImageRow | undefined> =>
	(await ctx.db.select().from(warmImages).where(eq(warmImages.sha, sha)))[0];

export const listWarmImages = async ({
	ctx,
	shas,
}: {
	ctx: TwdContext;
	shas: string[];
}): Promise<WarmImageRow[]> =>
	shas.length === 0
		? []
		: ctx.db.select().from(warmImages).where(inArray(warmImages.sha, shas));

export const upsertWarmImage = async ({
	ctx,
	sha,
	branch,
	status,
	jobId,
	imageTag,
	error,
}: {
	ctx: TwdContext;
	sha: string;
	branch: string;
	status: WarmImageRow["status"];
	jobId?: string;
	imageTag?: string;
	error?: string;
}) => {
	const values = {
		branch,
		status,
		jobId: jobId ?? null,
		imageTag: imageTag ?? null,
		error: error ?? null,
		readyAt: status === "ready" ? new Date() : null,
	};
	await ctx.db
		.insert(warmImages)
		.values({ sha, ...values })
		.onConflictDoUpdate({ target: warmImages.sha, set: values });
};

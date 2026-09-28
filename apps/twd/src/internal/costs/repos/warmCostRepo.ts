import { eq } from "drizzle-orm";
import { warmImages } from "../../../db/schema/runs.ts";
import type { TwdContext } from "../../../lib/types/twdContext.ts";
import { getCostRates, priceSandboxSeconds } from "../actions/getCostRates.ts";

/** Warm sandboxes use scripts/tw's worker size (TW_MODAL_WORKER_CPU / _MEM_MIB). */
export const recordWarmCost = async ({
	ctx,
	sha,
	buildSeconds,
	createdBy,
}: {
	ctx: TwdContext;
	sha: string;
	buildSeconds: number;
	createdBy: string;
}) => {
	const { workerCores, workerMemoryGib } = getCostRates();
	await ctx.db
		.update(warmImages)
		.set({
			buildSeconds,
			costUsd: priceSandboxSeconds({
				seconds: buildSeconds,
				cores: workerCores,
				memoryGib: workerMemoryGib,
			}),
			createdBy,
		})
		.where(eq(warmImages.sha, sha));
};

import type { MiscCache } from "@autumn/cache";
import type { Admin } from "kafkajs";

/** What "ready to be promoted" means: the log and each job's group answer, and both stores herald writes to. */
export type HeraldReadinessProbes = {
	kafka(): Promise<void>;
	eventsDb(): Promise<void>;
	miscCache(): Promise<void>;
};

export function createHeraldReadinessProbes({
	ctx,
	config,
}: {
	ctx: {
		admin: Pick<Admin, "fetchTopicMetadata" | "fetchOffsets">;
		eventsDb: { ping(): Promise<void> };
		miscCache: Pick<MiscCache, "getActive">;
	};
	config: { topic: string; groupIds: string[] };
}): HeraldReadinessProbes {
	/** The topic exists and every job's committed place can be read: the task can reach the group it is about to join. */
	async function kafka(): Promise<void> {
		await ctx.admin.fetchTopicMetadata({ topics: [config.topic] });
		for (const groupId of config.groupIds)
			await ctx.admin.fetchOffsets({ groupId, topics: [config.topic] });
	}
	async function eventsDb(): Promise<void> {
		await ctx.eventsDb.ping();
	}
	async function miscCache(): Promise<void> {
		await ctx.miscCache.getActive().ping();
	}
	return { kafka, eventsDb, miscCache };
}

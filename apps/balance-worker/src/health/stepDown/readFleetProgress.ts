import { type Admin, readTopicHighWatermarks } from "@autumn/kafka";
import { type PostgresClient, readTopicNextOffsets } from "@autumn/postgres";
import type { FleetProgress } from "./types/fleetProgress.js";

export async function readFleetProgress({
	ctx,
	topic,
}: {
	ctx: {
		partitionOffsets: Pick<Admin, "fetchTopicOffsets">;
		db: PostgresClient["db"];
	};
	topic: string;
}): Promise<FleetProgress> {
	const [highWatermarks, nextOffsets] = await Promise.allSettled([
		readTopicHighWatermarks({
			ctx: { partitionOffsets: ctx.partitionOffsets },
			topic,
		}),
		readTopicNextOffsets({ ctx: { db: ctx.db }, topic }),
	]);
	if (highWatermarks.status === "rejected") throw highWatermarks.reason;
	if (nextOffsets.status === "rejected") throw nextOffsets.reason;
	return {
		highWatermarks: highWatermarks.value,
		nextOffsets: nextOffsets.value,
	};
}

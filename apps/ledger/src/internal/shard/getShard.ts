import { logger } from "../../lib/logger.js";
import { createSqliteDb } from "../../sqlite/createSqliteDb.js";
import { getJournal } from "../journal/getJournal.js";
import { createShard } from "./createShard.js";
import type { Shard } from "./types/shard.js";
import type { ShardContext } from "./types/shardContext.js";

const shards = new Map<number, Shard>();

const createShardContext = ({ id }: { id: number }): ShardContext => ({
	shardId: id,
	sqlite: createSqliteDb(),
	journal: getJournal(),
	logger,
});

export const getShard = ({ id }: { id: number }): Shard => {
	const resident = shards.get(id);
	if (resident) return resident;

	const shard = createShard({ ctx: createShardContext({ id }) });
	shards.set(id, shard);
	return shard;
};

export const stopShards = async (): Promise<void> => {
	await Promise.all([...shards.values()].map((shard) => shard.stop()));
	shards.clear();
};

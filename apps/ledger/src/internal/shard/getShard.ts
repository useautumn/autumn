import { getJournal } from "../../lib/getJournal.js";
import { getPostgres } from "../../lib/getPostgres.js";
import { logger } from "../../lib/logger.js";
import { createSqliteDb } from "../../sqlite/common/createSqliteDb.js";
import { createSubjectResidency } from "../subjects/residency/createSubjectResidency.js";
import { createShard } from "./createShard.js";
import type { Shard } from "./types/shard.js";
import type { ShardContext } from "./types/shardContext.js";

const shards = new Map<number, Shard>();

const createShardContext = ({ id }: { id: number }): ShardContext => ({
	shardId: id,
	sqlite: createSqliteDb(),
	postgres: getPostgres(),
	journal: getJournal(),
	subjects: createSubjectResidency(),
	logger,
});

// The staleness poll must not conjure a shard for a customer nobody has asked
// this process about.
export const findShard = ({ id }: { id: number }): Shard | undefined =>
	shards.get(id);

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

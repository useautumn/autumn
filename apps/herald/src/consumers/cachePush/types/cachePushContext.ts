import type { BalanceWorkerClient } from "@autumn/balance-worker-client";
import type { ByocCacheWriter } from "@autumn/byoc";
import type { ReadThroughCacheContext } from "@autumn/cache";
import type { AutumnLogger } from "@autumn/logging";
import type { PostgresDb } from "@autumn/postgres";

export type CachePushContext = ReadThroughCacheContext & {
	logger: AutumnLogger;
	db: PostgresDb;
	balanceWorkerClient: Pick<BalanceWorkerClient, "readSubjectState">;
	/** Null until alien ships remote kv: entries are built, then skipped. */
	cacheWriter: ByocCacheWriter | null;
};

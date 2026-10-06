import type { BalanceWorkerClient } from "@autumn/balance-worker-client";
import type { ReadThroughCacheContext } from "@autumn/cache";
import type { EdgeConfigStore, ShadowAtomConfig } from "@autumn/edge-config";
import type { AutumnLogger } from "@autumn/logging";
import type { PostgresDb } from "@autumn/postgres";
import type { GetAtomClient } from "../../../atom/types/atomClient.js";

export type CachePushContext = ReadThroughCacheContext & {
	logger: AutumnLogger;
	db: PostgresDb;
	balanceWorkerClient: Pick<BalanceWorkerClient, "readSubjectState">;
	getAtomClient: GetAtomClient;
	shadowAtomConfig: Pick<EdgeConfigStore<ShadowAtomConfig>, "get">;
	/** How long a changed subject waits before its push, so a burst of changes is pushed once; 0 pushes at once. */
	cachePushCoalesceMs?: number;
};

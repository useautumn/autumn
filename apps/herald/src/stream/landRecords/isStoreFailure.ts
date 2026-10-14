import {
	isPostgresConnectionFailure,
	postgresSqlStateOf,
} from "@autumn/postgres";
import { isTinybirdError, TinybirdIngestError } from "@autumn/tinybird";
import { isBalanceWorkerUnavailable } from "./isBalanceWorkerUnavailable.js";

export const isStoreFailure = (cause: unknown): boolean => {
	if (cause instanceof TinybirdIngestError) return isStoreFailure(cause.cause);
	if (isTinybirdError(cause)) return true;
	if (isBalanceWorkerUnavailable(cause)) return true;
	if (postgresSqlStateOf({ error: cause })) return true;
	return isPostgresConnectionFailure({ error: cause });
};

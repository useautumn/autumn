import type { MeteringIdentity } from "@autumn/balance-engine";
import type { PartitionRoute } from "../../contracts/worker.js";
import type { HttpClient } from "../../http/types/httpClient.js";
import type { RouteHints } from "../createRouteHints.js";

export type PartitionOwner = PartitionRoute & { endpoint: string };
export type PartitionOwners = {
	findOwner(params: { partition: number }): PartitionOwner | undefined;
	refresh(): Promise<void>;
};
export type RoutingContext = {
	owners: PartitionOwners;
	/** Routes a worker named in its NOT_OWNER answer, tried ahead of a refresh. */
	hints?: RouteHints;
	http: HttpClient;
	partitionCount: number;
	timeoutMs: number;
	/** Slice of the request budget an ownership refresh may spend before the
	 *  request gives up on it. Keeps a rebalance from costing callers the whole
	 *  deadline. Unset means the refresh may use whatever budget is left. */
	routeRefreshTimeoutMs?: number;
	/** Sent on every request so owners may grant this server track units; absent, they grant none. */
	trackGrantLane?: string;
};
export type RoutedCommand = { identity: MeteringIdentity };
export type ResolvedCommandRoute = { endpoint: string; route: PartitionRoute };
export type RequestDeadline = { signal: AbortSignal; expiresAt: number };

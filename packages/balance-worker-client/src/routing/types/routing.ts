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
	hints?: RouteHints;
	http: HttpClient;
	partitionCount: number;
	timeoutMs: number;
	routeRefreshTimeoutMs?: number;
};
export type RoutedCommand = { identity: MeteringIdentity };
export type ResolvedCommandRoute = { endpoint: string; route: PartitionRoute };
export type RequestDeadline = { signal: AbortSignal; expiresAt: number };

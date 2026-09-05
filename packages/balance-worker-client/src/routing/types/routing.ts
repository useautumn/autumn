import type { MeteringIdentity } from "@autumn/balance-engine";
import type { PartitionRoute } from "../../contracts/worker.js";
import type { HttpClient } from "../../http/types/httpClient.js";

export type PartitionOwner = PartitionRoute & { endpoint: string };
export type PartitionOwners = {
	findOwner(params: { partition: number }): PartitionOwner | undefined;
	refresh(): Promise<void>;
};
export type RoutingContext = {
	owners: PartitionOwners;
	http: HttpClient;
	partitionCount: number;
	timeoutMs: number;
};
export type RoutedCommand = { identity: MeteringIdentity };
export type ResolvedCommandRoute = { endpoint: string; route: PartitionRoute };
export type RequestDeadline = { signal: AbortSignal; expiresAt: number };

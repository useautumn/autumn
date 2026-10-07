import type { Catalog, SubjectState } from "@autumn/balance-engine";
import type { CatalogCache } from "@autumn/catalog-lru";
import type {
	EdgeConfigStore,
	SubjectSnapshotsEdgeConfig,
} from "@autumn/edge-config";
import type { AutumnLogger } from "@autumn/logging";
import type { PartitionPosition } from "../../../committer/types/committer.js";
import type {
	StateStore,
	SubjectBaseline,
} from "../../../state/types/stateStore.js";
import type { WorkerDb } from "../../../types/workerDb.js";
import type { ReceiptPolicy } from "../../types/receiptPolicy.js";
import type { PartitionWriter } from "../../writer/types/partitionWriter.js";
import type { EntityLoads } from "../entityLoads/types/entityLoads.js";
import type { InFlightLoads } from "../inFlightLoads/types/inFlightLoad.js";
import type { SnapshotRefreshQueue } from "../snapshotRefresh/types/snapshotRefreshQueue.js";
import type { SubjectJoinCache } from "../subjectJoinCache/types/subjectJoinCache.js";

/** A customer's rows plus the catalog rows they reference: what every command computes against. */
export type Subject = {
	state: SubjectState;
	catalog: Catalog;
};

export type SubjectHydratorContext = {
	catalogCache: CatalogCache;
	db: Pick<
		WorkerDb,
		| "getSubjectRows"
		| "readSubjectSnapshot"
		| "readEntitySubjectSnapshots"
		| "getEntitySubjectRows"
	>;
	writer: Pick<PartitionWriter, "decide" | "readFreshestState" | "adopt">;
	receiptPolicy: ReceiptPolicy;
	/** Read at each cold load: `serve` and `verify` probe the subject's snapshot before its rows; absent or any other mode, every load is the rows. */
	subjectSnapshotsConfig?: EdgeConfigStore<SubjectSnapshotsEdgeConfig>;
	/** Where a refresh's read is written as the subject's row, through the partition's lane; absent, nothing is. */
	snapshotQueues?: StateStore["snapshotQueues"];
	/** The partition the hydrator serves, where its refreshes land. */
	position?: PartitionPosition;
	/** The partition's bookmark as the store holds it, read as a refresh begins: the log its row is good for. */
	readNextOffset?: StateStore["readNextOffset"];
	/** Defaults to "log", the sqlite store's answer. */
	baseline?: SubjectBaseline;
	logger?: Partial<Pick<AutumnLogger, "warn">>;
	/** A hydrated state at or over this many bytes is logged with its row counts; defaults to 1 MiB. */
	largeStateBytes?: number;
};

export type SubjectHydratorState = {
	inFlightLoads: InFlightLoads;
	joinCache: SubjectJoinCache;
	entityLoads: EntityLoads;
	snapshotRefresh: SnapshotRefreshQueue;
};

export type SubjectScope = {
	ctx: SubjectHydratorContext;
	state: SubjectHydratorState;
};

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
	writer: Pick<
		PartitionWriter,
		"decide" | "readFreshestState" | "adopt" | "waitForEvicted"
	>;
	receiptPolicy: ReceiptPolicy;
	subjectSnapshotsConfig?: EdgeConfigStore<SubjectSnapshotsEdgeConfig>;
	snapshotQueues?: StateStore["snapshotQueues"];
	position?: PartitionPosition;
	readNextOffset?: StateStore["readNextOffset"];
	baseline?: SubjectBaseline;
	logger?: Partial<Pick<AutumnLogger, "warn">>;
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

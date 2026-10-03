import type { Catalog, SubjectState } from "@autumn/balance-engine";
import type { CatalogCache } from "@autumn/catalog-lru";
import type { EdgeConfigStore } from "@autumn/edge-config";
import type { AutumnLogger } from "@autumn/logging";
import type { PartitionPosition } from "../../../committer/types/committer.js";
import type { SubjectSnapshotsEdgeConfig } from "../../../edgeConfig/subjectSnapshotsEdgeConfig.js";
import type {
	StateStore,
	SubjectBaseline,
} from "../../../state/types/stateStore.js";
import type { WorkerDb } from "../../../types/workerDb.js";
import type { ReceiptPolicy } from "../../types/receiptPolicy.js";
import type { PartitionWriter } from "../../writer/types/partitionWriter.js";
import type { EntityLoads } from "../entityLoads/types/entityLoads.js";
import type { InFlightLoads } from "../inFlightLoads/types/inFlightLoad.js";
import type { SnapshotLoader } from "../snapshotLoader/types/snapshotLoader.js";
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
		"getSubjectRows" | "getEntitySubjectRows" | "readSubjectSnapshots"
	>;
	writer: Pick<PartitionWriter, "decide" | "readFreshestState" | "adopt">;
	receiptPolicy: ReceiptPolicy;
	/** Read at each cold load: `serve` answers from `subject_snapshots` first; absent or any other mode, every load is a full read. */
	subjectSnapshotsConfig?: EdgeConfigStore<SubjectSnapshotsEdgeConfig>;
	/** Where a cold load's full read is written back, through the partition's lane; absent, nothing is. */
	snapshotWrites?: StateStore["snapshotWrites"];
	/** The partition the hydrator serves: where its backfills land, and named on the snapshot batch line. */
	position?: PartitionPosition;
	/** Defaults to "log", the sqlite store's answer. */
	baseline?: SubjectBaseline;
	logger?: Partial<Pick<AutumnLogger, "info" | "warn">>;
	/** A hydrated state at or over this many bytes is logged with its row counts; defaults to 1 MiB. */
	largeStateBytes?: number;
};

export type SubjectHydratorState = {
	inFlightLoads: InFlightLoads;
	joinCache: SubjectJoinCache;
	entityLoads: EntityLoads;
	snapshotLoader: SnapshotLoader;
};

export type SubjectScope = {
	ctx: SubjectHydratorContext;
	state: SubjectHydratorState;
};

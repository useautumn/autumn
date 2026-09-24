import type { Catalog, SubjectState } from "@autumn/balance-engine";
import type { CatalogCache } from "@autumn/catalog-lru";
import type { AutumnLogger } from "@autumn/logging";
import type { SubjectBaseline } from "../../../state/types/stateStore.js";
import type { WorkerDb } from "../../../types/workerDb.js";
import type { ReceiptPolicy } from "../../types/receiptPolicy.js";
import type { PartitionWriter } from "../../writer/types/partitionWriter.js";
import type { InFlightLoads } from "../inFlightLoads/types/inFlightLoad.js";

/** A customer's rows plus the catalog rows they reference: what every command computes against. */
export type Subject = {
	state: SubjectState;
	catalog: Catalog;
};

export type SubjectHydratorContext = {
	catalogCache: CatalogCache;
	db: Pick<WorkerDb, "getSubjectRows">;
	writer: Pick<PartitionWriter, "decide" | "readFreshestState" | "adopt">;
	receiptPolicy: ReceiptPolicy;
	/** Defaults to "log", the sqlite store's answer. */
	baseline?: SubjectBaseline;
	logger?: Partial<Pick<AutumnLogger, "warn">>;
	/** A hydrated state at or over this many bytes is logged with its row counts; defaults to 1 MiB. */
	largeStateBytes?: number;
};

export type SubjectHydratorState = {
	inFlightLoads: InFlightLoads;
};

export type SubjectScope = {
	ctx: SubjectHydratorContext;
	state: SubjectHydratorState;
};

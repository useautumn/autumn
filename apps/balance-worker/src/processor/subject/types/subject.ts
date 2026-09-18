import type { Catalog, SubjectState } from "@autumn/balance-engine";
import type { CatalogCache } from "../../../catalog/types/catalogCache.js";
import type { SubjectBaseline } from "../../../state/types/stateStore.js";
import type { WorkerDb } from "../../../types/workerDb.js";
import type { ReceiptPolicy } from "../../types/receiptPolicy.js";
import type { PartitionWriter } from "../../writer/types/partitionWriter.js";

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
};

/** One hydration in flight per customer; later requests for the same customer join it. */
export type SubjectHydratorState = {
	hydrationPromises: Map<string, Promise<SubjectState>>;
};

export type SubjectScope = {
	ctx: SubjectHydratorContext;
	state: SubjectHydratorState;
};

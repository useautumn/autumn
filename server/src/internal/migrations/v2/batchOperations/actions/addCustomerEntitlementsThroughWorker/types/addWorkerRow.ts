import type { BatchMigrationExecutionAdd } from "@/internal/migrations/v2/batchOperations/types/index.js";
import type { EnrichedCycleCandidate } from "@/internal/migrations/v2/batchOperations/utils/enrichCustomerEntitlementCycles.js";

export type AddWorkerRow = EnrichedCycleCandidate & {
	id: string;
	add: BatchMigrationExecutionAdd;
	ownerInternalEntityId: string | null;
	ownerEntityId: string | null;
	internalProductId: string;
	productIsCustom: boolean;
	productLoadedByWorker: boolean;
	customerPriceIds: string[];
	featureGrants: Record<string, string>;
};

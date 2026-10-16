import type { CustomerEntitlementPatch } from "@/internal/billing/v2/actions/batchTransition/types/entitlementPriceOperationTypes.js";
import type { BatchMigrationExecutionReplace } from "@/internal/migrations/v2/batchOperations/types/index.js";
import type { ReplaceRow } from "../../replaceCustomerEntitlementsForPage/applyReplacePatches.js";

export type ReplaceWorkerRow = ReplaceRow & {
	replace: BatchMigrationExecutionReplace;
	customerEntitlementPatch: CustomerEntitlementPatch;
};

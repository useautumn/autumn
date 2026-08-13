import type { Feature } from "@autumn/shared";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import type { BatchMigrationPagePhases } from "../execute/utils/pagePhaseTimings.js";
import type { OperationScope } from "../scope/operationScope.js";
import type { BatchMigrationExecutionLicenseOp } from "../types/batchMigrationExecutionPlan.js";
import { addLicenseEntitlementsForPage } from "./addLicenseEntitlementsForPage/addLicenseEntitlementsForPage.js";
import type { LicenseOpPageResult } from "./licenseOpPageResult.js";
import { removeLicenseEntitlementsForPage } from "./removeLicenseEntitlementsForPage/removeLicenseEntitlementsForPage.js";
import { replaceLicenseEntitlementsForPage } from "./replaceLicenseEntitlementsForPage/replaceLicenseEntitlementsForPage.js";
import { repointLicensePoolForPage } from "./repointLicensePoolForPage/repointLicensePoolForPage.js";

/** Routes one license op to the action that owns its verb. Compute emits the
 * repoint first per link, and the page awaits in order, so a pool is on its
 * minted link before any candidate select reads it. */
export const runLicenseEntitlementOp = async ({
	db,
	features,
	scope,
	internalCustomerIds,
	operation,
	now,
	phases,
	candidateRowBatchSize,
}: {
	db: DrizzleCli;
	features: Feature[];
	scope: OperationScope;
	internalCustomerIds: string[];
	operation: BatchMigrationExecutionLicenseOp;
	now: number;
	phases?: BatchMigrationPagePhases;
	candidateRowBatchSize?: number;
}): Promise<LicenseOpPageResult> => {
	switch (operation.type) {
		case "repoint_license_pool":
			return await repointLicensePoolForPage({
				db,
				scope,
				internalCustomerIds,
				operation,
				phases,
			});

		case "remove_license_entitlement":
			return await removeLicenseEntitlementsForPage({
				db,
				features,
				scope,
				internalCustomerIds,
				operation,
				phases,
			});

		case "replace_license_entitlement": {
			const replaced = await replaceLicenseEntitlementsForPage({
				db,
				features,
				scope,
				internalCustomerIds,
				replace: operation,
				now,
				phases,
				candidateRowBatchSize,
			});
			return {
				insertedItems: replaced.insertedItems,
				removedItems: replaced.removedItems,
				changedInternalCustomerIds: replaced.replacedInternalCustomerIds,
				excludedInternalCustomerIds: replaced.excludedInternalCustomerIds,
			};
		}

		case "add_license_entitlement":
			return await addLicenseEntitlementsForPage({
				db,
				scope,
				internalCustomerIds,
				operation,
				now,
				phases,
				candidateRowBatchSize,
			});
	}
};

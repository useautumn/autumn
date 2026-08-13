import type { EntitlementWithFeature } from "@autumn/shared";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import type { OperationScope } from "../../scope/operationScope.js";
import {
	type LicenseCandidateRow,
	selectLicenseCandidateRows,
} from "../selectLicenseCandidateRows.js";

/** Insert-if-absent assignments under the page's license pool. */
export const selectLicenseAddCandidateRows = async ({
	db,
	internalCustomerIds,
	scope,
	entitlement,
	licensePlanId,
	afterCustomerProductId,
	limit,
}: {
	db: DrizzleCli;
	internalCustomerIds: string[];
	scope: OperationScope;
	entitlement: EntitlementWithFeature;
	licensePlanId: string;
	afterCustomerProductId?: string;
	limit: number;
}): Promise<LicenseCandidateRow[]> =>
	selectLicenseCandidateRows({
		db,
		internalCustomerIds,
		scope,
		entitlement,
		licensePlanId,
		afterCustomerProductId,
		limit,
		match: "add",
	});

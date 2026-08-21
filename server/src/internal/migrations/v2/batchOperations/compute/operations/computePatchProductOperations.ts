import { computeCustomerEntitlementInitialState } from "@/internal/billing/v2/actions/batchTransition/compute/operations/entitlementPriceOperations/computeCustomerEntitlementPatch.js";
import type {
	BatchMigrationAddEntitlementOp,
	BatchMigrationOperations,
	BatchMigrationRemoveEntitlementOp,
	BatchMigrationReplaceEntitlementOp,
	PatchProductTransition,
} from "../../types/index.js";
import type { LicenseLinkTransitions } from "../transitions/resolvePlanLicenseTransitions.js";
import { toLicenseOps } from "./computeBatchMigrationOperations.js";

/** Lowers a customize patch: filter-from replace/remove, leftover adds, and
 * an optional customer-product repointer. Catalog products are not diffed. */
export const computePatchProductOperations = ({
	patchTransition,
	licenseLinks,
}: {
	patchTransition: PatchProductTransition;
	licenseLinks: LicenseLinkTransitions[];
}): BatchMigrationOperations => {
	const addEntitlements: BatchMigrationAddEntitlementOp[] =
		patchTransition.added
			.filter((entitlementPrice) => !entitlementPrice.price)
			.map((entitlementPrice) => ({
				entitlementPrice,
				initialState: computeCustomerEntitlementInitialState({
					entitlement: entitlementPrice.entitlement,
				}),
			}));

	const removeEntitlements: BatchMigrationRemoveEntitlementOp[] =
		patchTransition.removed.map(({ filter }) => ({
			by: "filter" as const,
			from: filter,
		}));

	const replaceEntitlements: BatchMigrationReplaceEntitlementOp[] =
		patchTransition.replaced
			.filter((pair) => !pair.to.price)
			.map((pair) => ({
				by: "filter" as const,
				from: pair.from,
				entitlementPrice: pair.to,
				initialState: computeCustomerEntitlementInitialState({
					entitlement: pair.to.entitlement,
				}),
			}));

	return {
		addEntitlements,
		removeEntitlements,
		replaceEntitlements,
		licenseEntitlements: licenseLinks.flatMap(toLicenseOps),
		repointCustomerProduct: patchTransition.customerProduct,
	};
};

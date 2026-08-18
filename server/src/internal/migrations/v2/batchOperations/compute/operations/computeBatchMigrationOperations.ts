import { computeCustomerEntitlementInitialState } from "@/internal/billing/v2/actions/batchTransition/compute/operations/entitlementPriceOperations/computeCustomerEntitlementPatch.js";
import type { ProductTransitions } from "@/internal/billing/v2/actions/batchTransition/compute/transitions/computeProductTransitions.js";
import type {
	BatchMigrationAddEntitlementOp,
	BatchMigrationLicenseEntitlementOp,
	BatchMigrationOperations,
	BatchMigrationRemoveEntitlementOp,
	BatchMigrationReplaceEntitlementOp,
} from "../../types/index.js";
import type { LicenseLinkTransitions } from "../transitions/resolvePlanLicenseTransitions.js";

const toLicenseOps = (
	link: LicenseLinkTransitions,
): BatchMigrationLicenseEntitlementOp[] => {
	const target = {
		licensePlanId: link.licensePlanId,
		planLicenseId: link.planLicenseId,
		licenseInternalProductId: link.licenseInternalProductId,
		isOneOff: link.isOneOff,
	};

	const added: BatchMigrationLicenseEntitlementOp[] =
		link.transitions.added.map((entitlementPrice) => ({
			...target,
			type: "add_license_entitlement",
			entitlement: entitlementPrice.entitlement,
			initialState: computeCustomerEntitlementInitialState({
				entitlement: entitlementPrice.entitlement,
			}),
		}));

	const replaced: BatchMigrationLicenseEntitlementOp[] =
		link.transitions.transitions.map((transition) => ({
			...target,
			type: "replace_license_entitlement",
			fromEntitlementId: transition.fromEntitlementPrice.entitlement.id,
			entitlement: transition.toEntitlementPrice.entitlement,
			initialState: computeCustomerEntitlementInitialState({
				entitlement: transition.toEntitlementPrice.entitlement,
			}),
		}));

	const removed: BatchMigrationLicenseEntitlementOp[] = link.artifacts.flatMap(
		(artifact) =>
			artifact.removes_filter
				? [
						{
							...target,
							type: "remove_license_entitlement" as const,
							filter: artifact.removes_filter,
						},
					]
				: [],
	);

	return [
		{ ...target, type: "repoint_license_pool" as const },
		...added,
		...replaced,
		...removed,
	];
};

/** Lowers both halves of a patch into the operations a page executes. Paid
 * pairs are skipped -- the transition-eligibility guard rejects them. */
export const computeBatchMigrationOperations = ({
	productTransitions,
	licenseLinks,
}: {
	productTransitions: ProductTransitions;
	licenseLinks: LicenseLinkTransitions[];
}): BatchMigrationOperations => {
	const addEntitlements: BatchMigrationAddEntitlementOp[] =
		productTransitions.entitlementPrices.added
			.filter((entitlementPrice) => !entitlementPrice.price)
			.map((entitlementPrice) => ({
				entitlementPrice,
				initialState: computeCustomerEntitlementInitialState({
					entitlement: entitlementPrice.entitlement,
				}),
			}));

	const removeEntitlements: BatchMigrationRemoveEntitlementOp[] =
		productTransitions.entitlementPrices.deleted
			.filter((entitlementPrice) => !entitlementPrice.price)
			.map((entitlementPrice) => ({ entitlementPrice }));

	const replaceEntitlements: BatchMigrationReplaceEntitlementOp[] =
		productTransitions.entitlementPrices.transitions
			.filter(
				(transition) =>
					!transition.fromEntitlementPrice.price &&
					!transition.toEntitlementPrice.price,
			)
			.map((transition) => ({
				fromEntitlementPrice: transition.fromEntitlementPrice,
				entitlementPrice: transition.toEntitlementPrice,
				initialState: computeCustomerEntitlementInitialState({
					entitlement: transition.toEntitlementPrice.entitlement,
				}),
			}));

	return {
		addEntitlements,
		removeEntitlements,
		replaceEntitlements,
		licenseEntitlements: licenseLinks.flatMap(toLicenseOps),
		repointCustomerProduct: productTransitions.customerProduct,
	};
};

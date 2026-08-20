import type {
	CatalogPropagateTargetParams,
	FullPlanLicense,
	LicenseCustomize,
} from "@autumn/shared";
import type { ProductStatesContext } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";
import type { UpsertProductPlan } from "@/internal/catalogV2/actions/updateCatalog/types/upsertProductPlan";
import { activeVersionForPlan } from "@/internal/catalogV2/actions/updateCatalog/utils/productStateUtils/activeVersionForPlan";

/** Current plan_license links on this row. Minted versions fall back to the clone source. */
export const upsertProductPlanToLicenses = ({
	upsert,
}: {
	upsert: UpsertProductPlan;
}): FullPlanLicense[] =>
	upsert.row.currentFullProduct?.licenses ??
	upsert.row.baseFullProduct?.licenses ??
	[];

/** The child row this link currently points at — base on a version mint. */
const childSourceInternalId = ({
	child,
}: {
	child: UpsertProductPlan;
}): string | undefined =>
	child.row.currentFullProduct?.internal_id ??
	child.row.baseFullProduct?.internal_id;

export const parentLicenseLinkForChild = ({
	parent,
	child,
}: {
	parent: UpsertProductPlan;
	child: UpsertProductPlan;
}): FullPlanLicense | undefined => {
	const sourceInternalId = childSourceInternalId({ child });
	return upsertProductPlanToLicenses({ upsert: parent }).find(
		(link) =>
			link.product.id === child.row.planId &&
			(sourceInternalId === undefined ||
				link.license_internal_product_id === sourceInternalId),
	);
};

/** True when the catalog link still points at a different child row than next. */
export const needsRepoint = ({
	currentPlanLicense,
	child,
}: {
	currentPlanLicense: FullPlanLicense;
	child: UpsertProductPlan;
}): boolean =>
	currentPlanLicense.license_internal_product_id !==
	child.row.nextFullProduct.internal_id;

/** True when this parent row does not yet own the catalog link (a version mint). */
export const needsNewParentLink = ({
	currentPlanLicense,
	parent,
}: {
	currentPlanLicense: FullPlanLicense;
	parent: UpsertProductPlan;
}): boolean =>
	currentPlanLicense.parent_internal_product_id !==
	parent.row.nextFullProduct.internal_id;

/** Omit / `existing` = the active pointer. `all_versions` is only the child's propagate target. */
const propagateTargetMatchesParent = ({
	target,
	parent,
	activeVersion,
}: {
	target: CatalogPropagateTargetParams;
	parent: UpsertProductPlan;
	activeVersion: number | undefined;
}): boolean => {
	if (target.plan_id !== parent.row.planId) return false;
	if (target.version !== undefined) return target.version === parent.row.version;
	if (target.versioning === "all_versions") return true;
	return (
		activeVersion !== undefined && parent.row.version === activeVersion
	);
};

export const childPropagatesToParent = ({
	child,
	parent,
	productStatesContext,
}: {
	child: UpsertProductPlan;
	parent: UpsertProductPlan;
	productStatesContext: ProductStatesContext;
}): boolean => {
	const activeVersion = activeVersionForPlan({
		planId: parent.row.planId,
		productStatesContext,
	});
	return (child.propagate?.license_parents ?? []).some((target) =>
		propagateTargetMatchesParent({ target, parent, activeVersion }),
	);
};

export const shouldPropagate = ({
	parent,
	child,
	productStatesContext,
}: {
	parent: UpsertProductPlan;
	child: UpsertProductPlan;
	productStatesContext: ProductStatesContext;
}): boolean => {
	if (parent.declaredLicenses !== undefined) return false;
	if (!child.entitlementPricesPlan) return false;
	if (!childPropagatesToParent({ child, parent, productStatesContext }))
		return false;
	return true;
};

/** Upserts that an in-batch parent currently offers as a license. */
export const upsertProductPlansToChildPlans = ({
	upsertProducts,
}: {
	upsertProducts: UpsertProductPlan[];
}): UpsertProductPlan[] =>
	upsertProducts.filter((child) =>
		upsertProducts.some((parent) =>
			parentLicenseLinkForChild({ parent, child }),
		),
	);

export const hasCustomizeFields = (
	customize: LicenseCustomize | null | undefined,
): customize is LicenseCustomize =>
	customize != null &&
	(customize.price !== undefined ||
		customize.add_items !== undefined ||
		customize.remove_items !== undefined);

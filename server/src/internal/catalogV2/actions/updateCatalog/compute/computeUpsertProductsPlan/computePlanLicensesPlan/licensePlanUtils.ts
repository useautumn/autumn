import {
	type CatalogPropagateTargetParams,
	type FullPlanLicense,
	type LicenseCustomize,
	productKeyToString,
	productToProductKey,
} from "@autumn/shared";
import type { ProductStatesContext } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";
import type { UpsertProductPlan } from "@/internal/catalogV2/actions/updateCatalog/types/upsertProductPlan";
import { activeVersionForPlan } from "@/internal/catalogV2/actions/updateCatalog/utils/productStateUtils/activeVersionForPlan";
import { findFullProductByInternalId } from "@/internal/catalogV2/actions/updateCatalog/utils/productStateUtils/findFullProductByInternalId";

/** Current plan_license links on this row. Minted versions fall back to the clone source. */
export const upsertProductPlanToLicenses = ({
	upsert,
}: {
	upsert: UpsertProductPlan;
}): FullPlanLicense[] =>
	upsert.row.currentFullProduct?.licenses ??
	upsert.row.baseFullProduct?.licenses ??
	[];

/** Child rows this parent may still be linked to — current, mint source, or demoted. */
const childSourceInternalIds = ({
	child,
}: {
	child: UpsertProductPlan;
}): string[] => [
	...new Set(
		[
			child.row.currentFullProduct?.internal_id,
			child.row.baseFullProduct?.internal_id,
			child.previousActiveInternalId,
		].filter((internalId): internalId is string => internalId !== undefined),
	),
];

/** Incoming links on the upserted child plus the demoted pointer (promote). */
export const reverseLinksForChild = ({
	upsert,
	productStatesContext,
}: {
	upsert: UpsertProductPlan;
	productStatesContext: ProductStatesContext;
}) => {
	const previousActive = upsert.previousActiveInternalId
		? findFullProductByInternalId({
				internalId: upsert.previousActiveInternalId,
				productStatesContext,
			})
		: null;
	const seen = new Set<string>();
	return [
		upsert.row.currentFullProduct,
		upsert.row.baseFullProduct,
		previousActive,
	].flatMap((product) => {
		if (!product) return [];
		return (product.parent_plan_licenses ?? []).filter((link) => {
			const key = productKeyToString({
				productKey: productToProductKey({ product: link.product }),
			});
			if (seen.has(key)) return false;
			seen.add(key);
			return true;
		});
	});
};

export const parentLicenseLinkForChild = ({
	parent,
	child,
}: {
	parent: UpsertProductPlan;
	child: UpsertProductPlan;
}): FullPlanLicense | undefined => {
	const sourceInternalIds = childSourceInternalIds({ child });
	return upsertProductPlanToLicenses({ upsert: parent }).find(
		(link) =>
			link.product.id === child.row.planId &&
			(sourceInternalIds.length === 0 ||
				sourceInternalIds.includes(link.license_internal_product_id)),
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

/** True when this row takes the unique active pointer (mint+active or existing promote). */
export const movesActivePointer = ({
	upsert,
}: {
	upsert: UpsertProductPlan;
}): boolean => {
	const nextIsActive = upsert.row.nextFullProduct.active;
	const mintedNewRow = upsert.row.versioning === "new_version";
	const promotedExisting = upsert.previousActiveInternalId != null;
	return nextIsActive && (mintedNewRow || promotedExisting);
};

/** In-place item writes, or the child taking the pointer. Draft-mint clones do not. */
export const childTriggersLicenseRewrite = ({
	child,
}: {
	child: UpsertProductPlan;
}): boolean => {
	const mintedNewRow = child.row.versioning === "new_version";
	const childHasItemWrites = child.entitlementPricesPlan != null;
	const inPlaceItemWrites = childHasItemWrites && !mintedNewRow;
	return inPlaceItemWrites || movesActivePointer({ upsert: child });
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
	const hasDeclaredLicenses = parent.declaredLicenses !== undefined;
	const rewritesLicenses = childTriggersLicenseRewrite({ child });
	const listedForPropagate = childPropagatesToParent({
		child,
		parent,
		productStatesContext,
	});

	if (hasDeclaredLicenses) return false;
	if (!rewritesLicenses) return false;
	if (!listedForPropagate) return false;
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

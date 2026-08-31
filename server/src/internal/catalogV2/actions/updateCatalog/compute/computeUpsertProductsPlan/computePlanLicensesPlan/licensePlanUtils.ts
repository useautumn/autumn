import {
	type CatalogPropagateTargetParams,
	type FullPlanLicense,
	type FullProduct,
	type LicenseCustomize,
	productKeyToString,
	productToProductKey,
} from "@autumn/shared";
import type { ProductStatesContext } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";
import type { UpsertProductPlan } from "@/internal/catalogV2/actions/updateCatalog/types/upsertProductPlan";
import { findFullProductByInternalId } from "@/internal/catalogV2/actions/updateCatalog/utils/productStateUtils/findFullProductByInternalId";
import { fullProductForPlanParams } from "@/internal/catalogV2/actions/updateCatalog/utils/productStateUtils/fullProductForPlanParams";

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

const uniqueReverseLinks = ({
	products,
}: {
	products: Array<FullProduct | null | undefined>;
}) => {
	const seen = new Set<string>();
	return products.flatMap((product) => {
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

/** Incoming links on every live version row of this child plan. */
export const reverseLinksOnChildPlan = ({
	planId,
	productStatesContext,
}: {
	planId: string;
	productStatesContext: ProductStatesContext;
}) =>
	uniqueReverseLinks({
		products: productStatesContext.versionsByPlanId[planId] ?? [],
	});

/** Incoming links on one child version row. */
export const reverseLinksOnChildProduct = ({
	planId,
	childInternalId,
	productStatesContext,
}: {
	planId: string;
	childInternalId: string;
	productStatesContext: ProductStatesContext;
}) => {
	const childRow = (productStatesContext.versionsByPlanId[planId] ?? []).find(
		(row) => row.internal_id === childInternalId,
	);
	return uniqueReverseLinks({ products: [childRow] });
};

/** Incoming links on the planned child row, plus the demoted pointer (promote). */
export const reverseLinksForChild = ({
	upsert,
	productStatesContext,
}: {
	upsert: UpsertProductPlan;
	productStatesContext: ProductStatesContext;
}) => {
	const plannedInternalId =
		upsert.row.currentFullProduct?.internal_id ??
		upsert.row.baseFullProduct?.internal_id ??
		upsert.row.nextFullProduct.internal_id;
	const hydrated = (
		productStatesContext.versionsByPlanId[upsert.row.planId] ?? []
	).find((row) => row.internal_id === plannedInternalId);
	const previousActive = upsert.previousActiveInternalId
		? findFullProductByInternalId({
				internalId: upsert.previousActiveInternalId,
				productStatesContext,
			})
		: null;
	return uniqueReverseLinks({
		products: [
			hydrated,
			upsert.row.currentFullProduct,
			upsert.row.baseFullProduct,
			previousActive,
		],
	});
};

export const parentLicenseLinkForChild = ({
	parent,
	child,
}: {
	parent: UpsertProductPlan;
	child: UpsertProductPlan;
}): FullPlanLicense | undefined => {
	const licenses = upsertProductPlanToLicenses({ upsert: parent });
	// Adopt mint clones the old row's link; pair by child plan so follow can
	// re-anchor onto the child's active row in this batch.
	if (parent.row.source === "license_adopt") {
		return licenses.find((link) => link.product.id === child.row.planId);
	}
	const sourceInternalIds = childSourceInternalIds({ child });
	return licenses.find(
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

/** Pin-only: the target names exactly this parent row. Adopt mints match their clone source. */
const propagateTargetMatchesParent = ({
	target,
	parent,
	productStatesContext,
}: {
	target: CatalogPropagateTargetParams;
	parent: UpsertProductPlan;
	productStatesContext: ProductStatesContext;
}): boolean => {
	if (target.plan_id !== parent.row.planId) return false;
	if (target.version === undefined && target.version_slug === undefined) {
		return false;
	}
	const pinnedRow = fullProductForPlanParams({
		planParams: target,
		productStatesContext,
	});
	const parentVersion =
		parent.row.source === "license_adopt"
			? parent.row.baseFullProduct?.version
			: parent.row.version;
	return pinnedRow?.version === parentVersion;
};

export const childPropagatesToParent = ({
	child,
	parent,
	productStatesContext,
}: {
	child: UpsertProductPlan;
	parent: UpsertProductPlan;
	productStatesContext: ProductStatesContext;
}): boolean =>
	(child.propagate?.license_parents ?? []).some((target) =>
		propagateTargetMatchesParent({
			target,
			parent,
			productStatesContext,
		}),
	);

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

/** Pin-lane trigger: in-place item writes only. Mints/promotes leave anchored links alone. */
export const childEditsItemsInPlace = ({
	child,
}: {
	child: UpsertProductPlan;
}): boolean => {
	const mintedNewRow = child.row.versioning === "new_version";
	const childHasItemWrites = child.entitlementPricesPlan != null;
	return childHasItemWrites && !mintedNewRow;
};

/** Propagate-lane trigger: in-place item writes, or the child taking the pointer. */
export const childTriggersLicenseRewrite = ({
	child,
}: {
	child: UpsertProductPlan;
}): boolean =>
	childEditsItemsInPlace({ child }) || movesActivePointer({ upsert: child });

/** In-place follow only reaches the row this link already points at. Mint/promote still move it. */
export const propagateReachesLink = ({
	currentPlanLicense,
	child,
}: {
	currentPlanLicense: FullPlanLicense;
	child: UpsertProductPlan;
}): boolean =>
	movesActivePointer({ upsert: child }) ||
	!needsRepoint({ currentPlanLicense, child });

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

import type { FullPlanLicense, FullProduct } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import type { ProductStatesContext } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";
import type {
	PlanLicensePlan,
	UpsertProductPlan,
} from "@/internal/catalogV2/actions/updateCatalog/types/upsertProductPlan";
import { findFullProductByInternalId } from "@/internal/catalogV2/actions/updateCatalog/utils/productStateUtils/findFullProductByInternalId";
import { isExistingRowPromote } from "@/internal/catalogV2/actions/updateCatalog/utils/productStateUtils/isExistingRowPromote";
import { getEntsWithFeature } from "@/internal/products/entitlements/entitlementUtils.js";
import {
	childTriggersLicenseRewrite,
	needsRepoint,
	parentLicenseLinkForChild,
	shouldPropagate,
	upsertProductPlansToChildPlans,
} from "../licensePlanUtils";
import { cloneFrozenChildAsLicenseOverlay } from "./cloneFrozenChildAsLicenseOverlay";

const childIsPromote = ({ child }: { child: UpsertProductPlan }): boolean =>
	isExistingRowPromote({
		current: child.row.currentFullProduct,
		next: child.row.nextFullProduct,
	});

const shouldPin = ({
	parent,
	child,
	currentPlanLicense,
	productStatesContext,
}: {
	parent: UpsertProductPlan;
	child: UpsertProductPlan;
	currentPlanLicense: FullPlanLicense;
	productStatesContext: ProductStatesContext;
}): boolean => {
	const hasDeclaredLicenses = parent.declaredLicenses !== undefined;
	const rewritesLicenses = childTriggersLicenseRewrite({ child });
	const promote = childIsPromote({ child });
	const followsViaPropagate = shouldPropagate({
		parent,
		child,
		productStatesContext,
	});
	const alreadyCustomized = currentPlanLicense.customized;
	const alreadyPinnedToNext = !needsRepoint({ currentPlanLicense, child });

	if (hasDeclaredLicenses) return false;
	if (followsViaPropagate) return false;
	if (!rewritesLicenses) return false;
	if (promote && alreadyCustomized) return false;
	if (alreadyCustomized && alreadyPinnedToNext) return false;
	return true;
};

const pinTargetProduct = ({
	child,
	productStatesContext,
}: {
	child: UpsertProductPlan;
	productStatesContext: ProductStatesContext;
}): FullProduct => {
	const promote = childIsPromote({ child });
	const demotedInternalId = child.previousActiveInternalId;
	if (promote && demotedInternalId) {
		return (
			findFullProductByInternalId({
				internalId: demotedInternalId,
				productStatesContext,
			}) ?? child.row.nextFullProduct
		);
	}
	return child.row.nextFullProduct;
};

const pinnedPlanLicense = ({
	ctx,
	currentPlanLicense,
	child,
	productStatesContext,
}: {
	ctx: AutumnContext;
	currentPlanLicense: FullPlanLicense;
	child: UpsertProductPlan;
	productStatesContext: ProductStatesContext;
}): PlanLicensePlan | undefined => {
	const childProduct = pinTargetProduct({ child, productStatesContext });
	const entitlementPricesPlan = currentPlanLicense.customized
		? undefined
		: cloneFrozenChildAsLicenseOverlay({
				ctx,
				frozenChildProduct: currentPlanLicense.product,
				childProduct,
			});
	const writesLink =
		currentPlanLicense.license_internal_product_id !==
		childProduct.internal_id;
	if (!writesLink && !entitlementPricesPlan) return undefined;

	return {
		op: "update",
		licensePlanId: child.row.planId,
		licenseProduct: childProduct,
		effectiveLicenseProduct: entitlementPricesPlan
			? {
					...childProduct,
					prices: entitlementPricesPlan.projected.prices,
					entitlements: getEntsWithFeature({
						ents: entitlementPricesPlan.projected.entitlements,
						features: ctx.features,
					}),
				}
			: currentPlanLicense.customized
				? currentPlanLicense.product
				: childProduct,
		currentPlanLicense,
		included: currentPlanLicense.included,
		prepaidOnly: currentPlanLicense.prepaid_only,
		entitlementPricesPlan,
	};
};

/**
 * Child-driven pin: clone the frozen child's items onto this parent if it
 * does not follow. Customized links and declared licenses[] are skipped.
 */
export const computePinnedPlanLicenses = ({
	ctx,
	parent,
	upsertProducts,
	productStatesContext,
}: {
	ctx: AutumnContext;
	parent: UpsertProductPlan;
	upsertProducts: UpsertProductPlan[];
	productStatesContext: ProductStatesContext;
}): PlanLicensePlan[] => {
	const pinned: PlanLicensePlan[] = [];

	for (const child of upsertProductPlansToChildPlans({ upsertProducts })) {
		const currentPlanLicense = parentLicenseLinkForChild({ parent, child });
		if (!currentPlanLicense) continue;
		if (
			!shouldPin({ parent, child, currentPlanLicense, productStatesContext })
		)
			continue;

		const planLicense = pinnedPlanLicense({
			ctx,
			currentPlanLicense,
			child,
			productStatesContext,
		});
		if (planLicense) pinned.push(planLicense);
	}

	return pinned;
};

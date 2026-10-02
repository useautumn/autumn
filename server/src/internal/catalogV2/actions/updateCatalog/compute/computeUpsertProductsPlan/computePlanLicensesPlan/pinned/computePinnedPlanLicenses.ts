import type { FullPlanLicense } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import type { ProductStatesContext } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";
import type {
	PlanLicensePlan,
	UpsertProductPlan,
} from "@/internal/catalogV2/actions/updateCatalog/types/upsertProductPlan";
import { getEntsWithFeature } from "@/internal/products/entitlements/entitlementUtils.js";
import {
	childEditsItemsInPlace,
	needsRepoint,
	parentLicenseLinkForChild,
	shouldPropagate,
	upsertProductPlansToChildPlans,
} from "../licensePlanUtils";
import { cloneFrozenChildAsLicenseOverlay } from "./cloneFrozenChildAsLicenseOverlay";

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
	const editsInPlace = childEditsItemsInPlace({ child });
	const anchorsEditedRow = !needsRepoint({ currentPlanLicense, child });
	const followsViaPropagate = shouldPropagate({
		parent,
		child,
		productStatesContext,
	});
	const alreadyCustomized = currentPlanLicense.customized;

	if (hasDeclaredLicenses) return false;
	if (followsViaPropagate) return false;
	if (!editsInPlace) return false;
	if (!anchorsEditedRow) return false;
	if (alreadyCustomized) return false;
	return true;
};

const pinnedPlanLicense = ({
	ctx,
	currentPlanLicense,
	child,
}: {
	ctx: AutumnContext;
	currentPlanLicense: FullPlanLicense;
	child: UpsertProductPlan;
}): PlanLicensePlan | undefined => {
	const childProduct = child.row.nextFullProduct;
	const entitlementPricesPlan = cloneFrozenChildAsLicenseOverlay({
		ctx,
		frozenChildProduct: currentPlanLicense.product,
		childProduct,
	});
	if (!entitlementPricesPlan) return undefined;

	return {
		op: "update",
		licensePlanId: child.row.planId,
		licenseProduct: childProduct,
		effectiveLicenseProduct: {
			...childProduct,
			prices: entitlementPricesPlan.projected.prices,
			entitlements: getEntsWithFeature({
				ents: entitlementPricesPlan.projected.entitlements,
				features: ctx.features,
			}),
		},
		currentPlanLicense,
		included: currentPlanLicense.included,
		prepaidOnly: currentPlanLicense.prepaid_only,
		entitlementPricesPlan,
	};
};

/**
 * Child-driven pin: an in-place child edit freezes non-following links anchored
 * to the edited row via an overlay. Mints/promotes never reach this lane.
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
		});
		if (planLicense) pinned.push(planLicense);
	}

	return pinned;
};

import type { FullPlanLicense } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import type {
	PlanLicensePlan,
	UpsertProductPlan,
} from "@/internal/catalogV2/actions/updateCatalog/types/upsertProductPlan";
import { getEntsWithFeature } from "@/internal/products/entitlements/entitlementUtils.js";
import {
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
	upsertProducts,
}: {
	parent: UpsertProductPlan;
	child: UpsertProductPlan;
	currentPlanLicense: FullPlanLicense;
	upsertProducts: UpsertProductPlan[];
}): boolean => {
	if (parent.declaredLicenses !== undefined) return false;
	if (!child.entitlementPricesPlan) return false;
	if (shouldPropagate({ parent, child, upsertProducts })) return false;

	if (
		currentPlanLicense.customized &&
		!needsRepoint({ currentPlanLicense, child })
	)
		return false;
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
	const entitlementPricesPlan = currentPlanLicense.customized
		? undefined
		: cloneFrozenChildAsLicenseOverlay({
				ctx,
				frozenChildProduct: currentPlanLicense.product,
				childProduct,
			});
	if (
		!needsRepoint({ currentPlanLicense, child }) &&
		!entitlementPricesPlan
	)
		return undefined;

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
}: {
	ctx: AutumnContext;
	parent: UpsertProductPlan;
	upsertProducts: UpsertProductPlan[];
}): PlanLicensePlan[] => {
	const pinned: PlanLicensePlan[] = [];

	for (const child of upsertProductPlansToChildPlans({ upsertProducts })) {
		const currentPlanLicense = parentLicenseLinkForChild({ parent, child });
		if (!currentPlanLicense) continue;
		if (!shouldPin({ parent, child, currentPlanLicense, upsertProducts }))
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

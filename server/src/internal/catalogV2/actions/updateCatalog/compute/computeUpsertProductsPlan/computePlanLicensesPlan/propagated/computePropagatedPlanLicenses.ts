import type { FullPlanLicense } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import type { ProductStatesContext } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";
import type {
	PlanLicensePlan,
	UpsertProductPlan,
} from "@/internal/catalogV2/actions/updateCatalog/types/upsertProductPlan";
import { computeLicenseOverlays } from "../declared/computeLicenseOverlays";
import {
	needsNewParentLink,
	needsRepoint,
	parentLicenseLinkForChild,
	propagateReachesLink,
	shouldPropagate,
	upsertProductPlansToChildPlans,
} from "../licensePlanUtils";
import { rebaseAdoptedLicenseCustomize } from "./rebaseAdoptedLicenseCustomize";

/** Uncustomized follow: share stock in place; write on a child mint or parent mint. */
const propagatedStockPlanLicense = ({
	currentPlanLicense,
	child,
	parent,
}: {
	currentPlanLicense: FullPlanLicense;
	child: UpsertProductPlan;
	parent: UpsertProductPlan;
}): PlanLicensePlan => {
	const childProduct = child.row.nextFullProduct;
	const writesLink =
		needsRepoint({ currentPlanLicense, child }) ||
		needsNewParentLink({ currentPlanLicense, parent });

	return {
		op: writesLink ? "update" : "none",
		licensePlanId: child.row.planId,
		licenseProduct: childProduct,
		effectiveLicenseProduct: childProduct,
		currentPlanLicense,
		included: currentPlanLicense.included,
		prepaidOnly: currentPlanLicense.prepaid_only,
	};
};

/**
 * Customized follow: rebase the overlay onto the new child. licenseProduct
 * is always next, so a mint re-points in the same write.
 */
const propagatedOverlayPlanLicense = ({
	ctx,
	currentPlanLicense,
	child,
}: {
	ctx: AutumnContext;
	currentPlanLicense: FullPlanLicense;
	child: UpsertProductPlan;
}): PlanLicensePlan | undefined => {
	const oldChildProduct =
		child.row.currentFullProduct ?? child.row.baseFullProduct;
	if (!oldChildProduct) return undefined;

	const childProduct = child.row.nextFullProduct;
	const customize = rebaseAdoptedLicenseCustomize({
		ctx,
		oldChildProduct,
		effectiveProduct: currentPlanLicense.product,
		newChildProduct: childProduct,
	});

	return {
		op: "update",
		licensePlanId: child.row.planId,
		licenseProduct: childProduct,
		effectiveLicenseProduct: childProduct,
		currentPlanLicense,
		included: currentPlanLicense.included,
		prepaidOnly: currentPlanLicense.prepaid_only,
		customize,
	};
};

const propagatedPlanLicense = ({
	ctx,
	currentPlanLicense,
	child,
	parent,
}: {
	ctx: AutumnContext;
	currentPlanLicense: FullPlanLicense;
	child: UpsertProductPlan;
	parent: UpsertProductPlan;
}): PlanLicensePlan | undefined =>
	currentPlanLicense.customized
		? propagatedOverlayPlanLicense({ ctx, currentPlanLicense, child })
		: propagatedStockPlanLicense({ currentPlanLicense, child, parent });

/**
 * Child-driven adopt: listed parents follow this child's next items.
 * In-place uncustomized share stock; mint/promote may re-point.
 */
export const computePropagatedPlanLicenses = ({
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
	const propagated: PlanLicensePlan[] = [];

	for (const child of upsertProductPlansToChildPlans({ upsertProducts })) {
		const currentPlanLicense = parentLicenseLinkForChild({ parent, child });
		if (!currentPlanLicense) continue;
		if (
			parent.row.source === "license_adopt" &&
			!child.row.nextFullProduct.active
		) {
			continue;
		}
		if (!shouldPropagate({ parent, child, productStatesContext })) continue;
		if (!propagateReachesLink({ currentPlanLicense, child })) continue;

		const planLicense = propagatedPlanLicense({
			ctx,
			currentPlanLicense,
			child,
			parent,
		});
		if (planLicense) propagated.push(planLicense);
	}

	return computeLicenseOverlays({ ctx, planLicenses: propagated });
};

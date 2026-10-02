import type {
	PlanLicensePlan,
	PlanLicensePricesAndEntitlements,
} from "@/internal/catalogV2/actions/updateCatalog/types/upsertProductPlan";

const empty = (): PlanLicensePricesAndEntitlements => ({
	entitlementIds: [],
	priceIds: [],
});

const fromProduct = ({
	prices,
	entitlements,
}: {
	prices: { id: string }[];
	entitlements: { id: string }[];
}): PlanLicensePricesAndEntitlements => ({
	entitlementIds: entitlements.map((entitlement) => entitlement.id),
	priceIds: prices.map((price) => price.id),
});

/**
 * Overlay → effective ids. Clear → empty in place. Preserve → copy current
 * overlay ids onto a mint. Undefined leaves the license's items untouched.
 */
export const computeLicensePricesAndEntitlements = ({
	planLicense,
	writesFreshRow,
}: {
	planLicense: PlanLicensePlan;
	writesFreshRow: boolean;
}): PlanLicensePricesAndEntitlements | undefined => {
	if (planLicense.entitlementPricesPlan && planLicense.effectiveLicenseProduct) {
		return fromProduct(planLicense.effectiveLicenseProduct);
	}

	const currentCustomized = planLicense.currentPlanLicense?.customized ?? false;

	if (planLicense.customize === null) {
		return !writesFreshRow && currentCustomized ? empty() : undefined;
	}

	if (writesFreshRow && currentCustomized && planLicense.currentPlanLicense) {
		return fromProduct(planLicense.currentPlanLicense.product);
	}

	return undefined;
};

import { isDeepStrictEqual } from "node:util";
import type {
	FullPlanLicense,
	FullProduct,
	PlanLicenseParams,
} from "@autumn/shared";
import { resolveLicenseProduct } from "@/internal/catalogV2/actions/updateCatalog/compute/computeUpsertProductsPlan/computePlanLicensesPlan/resolveLicenseProduct";
import type { ProductStatesContext } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";
import type { PlanLicensePlan } from "@/internal/catalogV2/actions/updateCatalog/types/upsertProductPlan";

const declaredLinkChanged = ({
	currentPlanLicense,
	params,
	licenseProduct,
}: {
	currentPlanLicense: FullPlanLicense;
	params: PlanLicenseParams;
	licenseProduct: FullProduct | null;
}): boolean => {
	if (params.customize) return true;
	if (params.customize === null && currentPlanLicense.customized) return true;
	if ((params.included ?? 0) !== currentPlanLicense.included) return true;
	if ((params.prepaid_only ?? true) !== currentPlanLicense.prepaid_only)
		return true;
	if (
		params.metadata !== undefined &&
		!isDeepStrictEqual(currentPlanLicense.metadata ?? {}, params.metadata)
	) {
		return true;
	}
	if (
		licenseProduct &&
		licenseProduct.internal_id !==
			currentPlanLicense.license_internal_product_id
	) {
		return true;
	}
	return false;
};

/** Diff the declared licenses[] set against current links → per-link write ops. */
export const diffDeclaredPlanLicenses = ({
	declared,
	currentLicenses,
	productStatesContext,
}: {
	declared: PlanLicenseParams[];
	currentLicenses: FullPlanLicense[];
	productStatesContext: ProductStatesContext;
}): PlanLicensePlan[] => {
	const currentPlanLicenseByPlanId = new Map<string, FullPlanLicense>();
	for (const currentPlanLicense of currentLicenses) {
		currentPlanLicenseByPlanId.set(
			currentPlanLicense.product.id,
			currentPlanLicense,
		);
	}
	const declaredIds = new Set(declared.map((entry) => entry.license_plan_id));

	const planned: PlanLicensePlan[] = declared.map((params) => {
		const licenseProduct = resolveLicenseProduct({
			licensePlanId: params.license_plan_id,
			productStatesContext,
		});
		const currentPlanLicense =
			currentPlanLicenseByPlanId.get(params.license_plan_id) ?? null;

		const op = !currentPlanLicense
			? "create"
			: declaredLinkChanged({ currentPlanLicense, params, licenseProduct })
				? "update"
				: "none";

		// Preserve keeps the current customized content; overlay compute overrides.
		const effectiveLicenseProduct =
			params.customize === undefined && currentPlanLicense?.customized
				? currentPlanLicense.product
				: licenseProduct;

		return {
			op,
			licensePlanId: params.license_plan_id,
			licenseProduct,
			effectiveLicenseProduct,
			currentPlanLicense,
			included: params.included ?? 0,
			prepaidOnly: params.prepaid_only ?? true,
			metadata: params.metadata,
			customize: params.customize,
		};
	});

	for (const currentPlanLicense of currentLicenses) {
		if (declaredIds.has(currentPlanLicense.product.id)) continue;
		planned.push({
			op: "remove",
			licensePlanId: currentPlanLicense.product.id,
			licenseProduct: null,
			effectiveLicenseProduct: null,
			currentPlanLicense,
			included: 0,
			prepaidOnly: currentPlanLicense.prepaid_only,
		});
	}

	return planned;
};

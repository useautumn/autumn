import { isDeepStrictEqual } from "node:util";
import {
	type FullPlanLicense,
	type FullProduct,
	licenseCustomizesAreSame,
	type PlanLicenseParams,
} from "@autumn/shared";
import type { ProductStatesContext } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";
import type { PlanLicensePlan } from "@/internal/catalogV2/actions/updateCatalog/types/upsertProductPlan";
import { activeFullProductForPlan } from "@/internal/catalogV2/actions/updateCatalog/utils/productStateUtils/activeFullProductForPlan";
import { findFullProductByInternalId } from "@/internal/catalogV2/actions/updateCatalog/utils/productStateUtils/findFullProductByInternalId";
import { fullProductForSlug } from "@/internal/catalogV2/actions/updateCatalog/utils/productStateUtils/fullProductForSlug";
import { licensePlanCustomize } from "@/internal/licenses/licenseLinkCustomize";

/** The link's actual current overlay vs. its base version — undefined when stock. */
const currentLinkCustomize = (currentPlanLicense: FullPlanLicense) =>
	currentPlanLicense.customized && currentPlanLicense.base_product
		? licensePlanCustomize({
				product: currentPlanLicense.product,
				baseProduct: currentPlanLicense.base_product,
			})
		: undefined;

const declaredLinkChanged = ({
	currentPlanLicense,
	params,
	licenseProduct,
}: {
	currentPlanLicense: FullPlanLicense;
	params: PlanLicenseParams;
	licenseProduct: FullProduct | null;
}): boolean => {
	if (
		params.customize !== undefined &&
		!licenseCustomizesAreSame({
			left: params.customize,
			right: currentLinkCustomize(currentPlanLicense),
		})
	) {
		return true;
	}
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

/** Stated slug = that row. Omitted keeps the existing child id; new links use active. */
const anchorFullProductForDeclared = ({
	params,
	currentPlanLicense,
	productStatesContext,
}: {
	params: PlanLicenseParams;
	currentPlanLicense: FullPlanLicense | null;
	productStatesContext: ProductStatesContext;
}): FullProduct | null => {
	if (params.version_slug !== undefined) {
		return fullProductForSlug({
			planId: params.license_plan_id,
			versionSlug: params.version_slug,
			productStatesContext,
		});
	}

	if (currentPlanLicense) {
		return (
			findFullProductByInternalId({
				internalId: currentPlanLicense.license_internal_product_id,
				productStatesContext,
			}) ?? currentPlanLicense.product
		);
	}

	return activeFullProductForPlan({
		planId: params.license_plan_id,
		productStatesContext,
	});
};

/** Declared licenses[] vs current links → per-link write ops. */
export const resolveDeclaredPlanLicenses = ({
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
		const currentPlanLicense =
			currentPlanLicenseByPlanId.get(params.license_plan_id) ?? null;
		const licenseProduct = anchorFullProductForDeclared({
			params,
			currentPlanLicense,
			productStatesContext,
		});

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
			declaredVersionSlug: params.version_slug,
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

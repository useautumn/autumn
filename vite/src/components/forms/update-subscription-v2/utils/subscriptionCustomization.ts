import type {
	CustomizePlanLicense,
	Feature,
	FrontendProduct,
	FullCustomerLicense,
	ProductV2,
} from "@autumn/shared";
import {
	diffPlanV1,
	mapToProductV2,
	productV2ToApiPlanV1,
} from "@autumn/shared";
import {
	getProductWithSupportedPlanFormValues,
	getSupportedPlanFormPatchFromDraftProduct,
} from "@/components/forms/shared/utils/planCustomizationUtils";
import { resolveLicenseProductWithFallback } from "@/views/products/plan/components/plan-licenses/resolvePlanLicenseProduct";
import type { UpdateSubscriptionForm } from "../updateSubscriptionFormSchema";

export { areTrialConfigsEqual } from "@/components/forms/shared/utils/planCustomizationUtils";

export const getProductWithSupportedFormValues = ({
	baseProduct,
	formValues,
}: {
	baseProduct: FrontendProduct;
	formValues: UpdateSubscriptionForm;
}): FrontendProduct => {
	return getProductWithSupportedPlanFormValues({
		baseProduct,
		formValues,
	});
};

export const getSupportedFormPatchFromDraftProduct = ({
	baseProduct,
	draftProduct,
	isCurrentlyTrialing,
}: {
	baseProduct: FrontendProduct;
	draftProduct: FrontendProduct;
	isCurrentlyTrialing: boolean;
}): Partial<UpdateSubscriptionForm> => {
	return getSupportedPlanFormPatchFromDraftProduct({
		baseProduct,
		draftProduct,
		isCurrentlyTrialing,
		includeRemoveTrial: true,
	});
};

export const getSupportedFormOverridesFromProductCustomization = ({
	customizedProduct,
	baseProduct,
	currentVersion,
}: {
	customizedProduct?: FrontendProduct;
	baseProduct: FrontendProduct;
	currentVersion: number;
}): Partial<UpdateSubscriptionForm> => {
	if (!customizedProduct) {
		return {};
	}

	const overrides: Partial<UpdateSubscriptionForm> = {
		items: customizedProduct.items ?? null,
		version: customizedProduct.version ?? currentVersion,
	};

	const hasExplicitTrial = customizedProduct.free_trial !== undefined;
	if (!hasExplicitTrial) {
		return overrides;
	}

	const trialPatch = getSupportedFormPatchFromDraftProduct({
		baseProduct,
		draftProduct: customizedProduct,
		isCurrentlyTrialing: Boolean(baseProduct.free_trial),
	});

	return {
		...overrides,
		...trialPatch,
	};
};

export const customerLicensesToCustomizePlanLicenses = ({
	customerLicenses,
	licenseProducts,
	features,
}: {
	customerLicenses: FullCustomerLicense[] | undefined;
	licenseProducts: ProductV2[];
	features: Feature[];
}): CustomizePlanLicense[] =>
	(customerLicenses ?? []).flatMap((customerLicense) => {
		const planLicense = customerLicense.planLicense;
		if (!planLicense?.is_custom) return [];
		const baseProduct = resolveLicenseProductWithFallback({
			products: licenseProducts,
			planId: planLicense.product.id,
			version: planLicense.product.version,
		});
		if (!baseProduct) return [];

		const customize = diffPlanV1({
			from: productV2ToApiPlanV1({
				product: baseProduct,
				features,
			}),
			to: productV2ToApiPlanV1({
				product: mapToProductV2({ product: planLicense.product, features }),
				features,
			}),
		});

		return [
			{
				license_plan_id: baseProduct.id,
				included: planLicense.included,
				prepaid_only: planLicense.prepaid_only,
				customize:
					Object.keys(customize).length > 0 ? customize : undefined,
			},
		];
	});

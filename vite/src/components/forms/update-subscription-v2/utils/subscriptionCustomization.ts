import type { FrontendProduct } from "@autumn/shared";
import {
	getProductWithSupportedPlanFormValues,
	getSupportedPlanFormPatchFromDraftProduct,
} from "@/components/forms/shared/utils/planCustomizationUtils";
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

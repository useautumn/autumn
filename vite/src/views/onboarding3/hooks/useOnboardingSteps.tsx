import type { CreateFeature, Feature, ProductV2 } from "@autumn/shared";
import {
	FeatureType,
	FeatureUsageType,
	isPriceItem,
	productV2ToBasePrice,
} from "@autumn/shared";
import { useSteps } from "@/views/products/product/product-item/useSteps";
import { OnboardingStep } from "../utils/onboardingUtils";

export const useOnboardingSteps = () => {
	const {
		stepVal: step,
		pushStep,
		popStep,
	} = useSteps({
		initialStep: OnboardingStep.PlanDetails,
	});

	// Step validation
	const validateStep = (
		currentStep: OnboardingStep,
		product: ProductV2 | null,
		feature: Feature | CreateFeature | null,
	): boolean => {
		switch (currentStep) {
			case OnboardingStep.PlanDetails: {
				// Basic validation for name and ID
				const basicValid =
					product?.name?.trim() !== "" && product?.id?.trim() !== "";
				if (!basicValid) return false;

				// Base price validation
				const basePrice = productV2ToBasePrice({ product });
				const hasBasePriceItem = product?.items?.some((item) =>
					isPriceItem(item),
				);

				// If base price is unchecked (no price item), that's valid
				if (!hasBasePriceItem) return true;

				// If base price is checked, it needs a valid amount
				return basePrice?.amount != null && basePrice.amount > 0;
			}
			case OnboardingStep.FeatureCreation:
				return (
					feature?.name?.trim() !== "" &&
					feature?.id?.trim() !== "" &&
					feature?.type !== null &&
					(feature.type === FeatureType.Boolean ||
						feature?.config?.usage_type === FeatureUsageType.Continuous ||
						feature?.config?.usage_type === FeatureUsageType.Single)
				);
			case OnboardingStep.FeatureConfiguration:
				return true;
			case OnboardingStep.Playground:
				return true;
			case OnboardingStep.Integration:
				return true;
			default:
				return false;
		}
	};

	return {
		step,
		pushStep,
		popStep,
		validateStep,
	};
};

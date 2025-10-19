import type { CreateFeature, Feature, ProductV2 } from "@autumn/shared";
import {
	FeatureType,
	FeatureUsageType,
	isPriceItem,
	productV2ToBasePrice,
} from "@autumn/shared";
import { OnboardingStep } from "../utils/onboardingUtils";
import { useOnboarding3QueryState } from "./useOnboarding3QueryState";

export const useOnboardingSteps = () => {
	// Use query state instead of local state
	const { queryStates } = useOnboarding3QueryState();
	const step = queryStates.step;

	// Step validation
	const validateStep = (
		currentStep: OnboardingStep,
		product: ProductV2 | undefined,
		feature: Feature | CreateFeature | null,
	): boolean => {
		switch (currentStep) {
			case OnboardingStep.PlanDetails: {
				// Return false if product is null or undefined
				if (!product) return false;

				// Basic validation for name and ID
				const basicValid =
					product?.name?.trim() !== "" && product?.id?.trim() !== "";
				if (!basicValid) return false;

				// Base price validation - safely check if product has items
				if (!product.items) return false;

				const basePrice = productV2ToBasePrice({
					product: product as unknown as ProductV2,
				});
				const hasBasePriceItem = product.items.some((item) =>
					isPriceItem(item),
				);

				// If base price is unchecked (no price item), that's valid
				if (!hasBasePriceItem) return true;

				// If base price is checked, it needs a valid amount
				return basePrice?.amount != null && basePrice.amount > 0;
			}
			case OnboardingStep.FeatureCreation:
				return (
					(feature &&
						feature?.name?.trim() !== "" &&
						feature?.id?.trim() !== "" &&
						feature?.type !== null &&
						(feature.type === FeatureType.Boolean ||
							feature?.config?.usage_type === FeatureUsageType.Continuous ||
							feature?.config?.usage_type === FeatureUsageType.Single)) ??
					false
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
		validateStep,
	};
};

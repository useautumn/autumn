import { FeatureType, FeatureUsageType } from "@autumn/shared";
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
		product: any,
		feature: any,
	): boolean => {
		switch (currentStep) {
			case OnboardingStep.PlanDetails:
				return product?.name?.trim() !== "" && product?.id?.trim() !== "";
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

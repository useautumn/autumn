import { OnboardingStep } from "../utils/OnboardingStep";
import { useSteps } from "@/views/products/product/product-item/useSteps";

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
				return feature?.name?.trim() !== "" && feature?.id?.trim() !== "";
			case OnboardingStep.FeatureConfiguration:
				return true;
			case OnboardingStep.Playground:
				return true;
			case OnboardingStep.Completion:
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

import {
	type CreateFeature,
	type Feature,
	FeatureType,
	type ProductV2,
} from "@autumn/shared";
import { useCallback } from "react";
import { useNavigate } from "react-router";
import { useFeatureStore } from "@/hooks/stores/useFeatureStore";
import { useHasChanges, useProductStore } from "@/hooks/stores/useProductStore";
import { useEnv } from "@/utils/envUtils";
import { pushPage } from "@/utils/genUtils";
import { useOnboardingStore } from "../../store/useOnboardingStore";
import { getNextStep, OnboardingStep } from "../../utils/onboardingUtils";
import { useFeatureConfigActions } from "./useFeatureConfigActions";
import { useFeatureCreationActions } from "./useFeatureCreationActions";
import { usePlanDetailsActions } from "./usePlanDetailsActions";

interface StepActionsProps {
	// Flow state
	step: OnboardingStep;
	pushStep: (step: OnboardingStep) => void;
	popStep: () => void;
	validateStep: (
		step: OnboardingStep,
		product: ProductV2 | undefined,
		feature: Feature | CreateFeature | null,
	) => boolean;
	// Shared actions (passed from parent)
	sharedActions: {
		handlePlanSelect: (planId: string) => Promise<void>;
		handleBack: () => Promise<void>;
		onCreatePlanSuccess: (newProduct: ProductV2) => Promise<void>;
	};
}

export const useStepActions = (props: StepActionsProps) => {
	const { step, pushStep, validateStep, sharedActions } = props;

	const navigate = useNavigate();
	const env = useEnv();

	// Get product from product store
	const product = useProductStore((s) => s.product);

	// Get state from Zustand
	const feature = useFeatureStore((state) => state.feature);
	const setIsButtonLoading = useOnboardingStore((s) => s.setIsButtonLoading);
	const hasChanges = useHasChanges();

	// Step-specific action hooks (they access state directly now)
	const planDetailsActions = usePlanDetailsActions();
	const featureCreationActions = useFeatureCreationActions();
	const featureConfigActions = useFeatureConfigActions();

	// Main navigation handler
	const handleNext = useCallback(async () => {
		if (!validateStep(step, product, feature)) return;

		let nextStep = getNextStep(step);
		let canProceed = true;

		// Set loading for steps 1 and 2
		if (
			step === OnboardingStep.PlanDetails ||
			step === OnboardingStep.FeatureCreation ||
			(step === OnboardingStep.FeatureConfiguration && hasChanges)
		) {
			console.log("setting loading to true", step);
			setIsButtonLoading(true);
		}

		try {
			// Step 1: Create product
			if (step === OnboardingStep.PlanDetails) {
				canProceed = await planDetailsActions.handleProceed();
			}

			// Step 2: Create feature and add to product
			if (step === OnboardingStep.FeatureCreation) {
				canProceed = await featureCreationActions.handleProceed();

				// Skip Step 3 (FeatureConfiguration) for Boolean features
				if (
					canProceed &&
					feature?.type === FeatureType.Boolean &&
					nextStep === OnboardingStep.FeatureConfiguration
				) {
					nextStep = OnboardingStep.Playground;

					// Add a basic Boolean feature item to the product for preview
					// (just for display in Step 4, won't be saved until user manually saves)
					const currentProduct = useProductStore.getState().product;

					// Check if this feature item already exists
					const featureExists = currentProduct.items?.some(
						(item) => item.feature_id === feature.id,
					);

					if (!featureExists) {
						const updatedProduct = {
							...currentProduct,
							items: [
								...(currentProduct.items || []),
								{
									feature_id: feature.id,
									feature_type: "static" as const,
									included_usage: null,
									interval: null,
									price: null,
									tiers: null,
									billing_units: null,
									entity_feature_id: null,
									reset_usage_when_enabled: null,
								},
							],
						};
						useProductStore.getState().setProduct(updatedProduct as ProductV2);
					}
				}
			}

			// Step 3: Save product changes before moving to playground
			if (
				step === OnboardingStep.FeatureConfiguration &&
				nextStep === OnboardingStep.Playground
			) {
				canProceed = await featureConfigActions.handleProceed();
			}

			if (!canProceed) return;

			if (nextStep) {
				pushStep(nextStep);
			} else {
				// Finish onboarding

				pushPage({
					navigate,
					path: "/products",
					queryParams: {
						tab: "products",
					},
					preserveParams: true,
				});
				// navigateTo("/products?tab=products", navigate, env);
			}
		} finally {
			// Always clear loading state
			setIsButtonLoading(false);
		}
	}, [
		validateStep,
		step,
		product,
		feature,
		planDetailsActions,
		featureCreationActions,
		featureConfigActions,
		pushStep,
		setIsButtonLoading,
		hasChanges,
		navigate,
	]);

	return {
		handleNext,
		handleBack: sharedActions.handleBack,
		handlePlanSelect: sharedActions.handlePlanSelect,
		onCreatePlanSuccess: sharedActions.onCreatePlanSuccess,
	};
};

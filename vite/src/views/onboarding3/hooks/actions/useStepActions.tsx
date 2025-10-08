import type { CreateFeature, Feature, ProductV2 } from "@autumn/shared";
import { type MutableRefObject, useCallback } from "react";
import { useNavigate } from "react-router";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { useEnv } from "@/utils/envUtils";
import { navigateTo } from "@/utils/genUtils";
import { getNextStep, OnboardingStep } from "../../utils/onboardingUtils";
import { useFeatureConfigActions } from "./useFeatureConfigActions";
import { useFeatureCreationActions } from "./useFeatureCreationActions";
import { usePlanDetailsActions } from "./usePlanDetailsActions";
import { useSharedActions } from "./useSharedActions";

interface StepActionsProps {
	// Flow state
	step: OnboardingStep;
	pushStep: (step: OnboardingStep) => void;
	popStep: () => void;
	validateStep: (
		step: OnboardingStep,
		product: ProductV2 | null,
		feature: Feature | CreateFeature | null,
	) => boolean;

	// Data
	product: ProductV2 | null;
	setProduct: (product: ProductV2) => void;
	baseProduct: ProductV2;
	setBaseProduct: (product: ProductV2) => void;
	feature: Feature | CreateFeature | null;
	setFeature: (feature: Feature | CreateFeature | null) => void;
	diff: { hasChanges: boolean };
	selectedProductId: string;
	setSelectedProductId: (id: string) => void;
	productCreatedRef: MutableRefObject<{
		created: boolean;
		latestId: string | null;
	}>;
	featureCreatedRef: MutableRefObject<{
		created: boolean;
		latestId: string | null;
	}>;

	// External actions
	handleRefetch: () => Promise<void>;
	refetchProducts: () => Promise<unknown>;
	refetchFeatures: () => Promise<unknown>;

	// UI state setters
	setSheet: (sheet: string | null) => void;
	setEditingState: (state: {
		type: "plan" | "feature" | null;
		id: string | null;
	}) => void;
	setIsLoading: (loading: boolean) => void;
}

export const useStepActions = (props: StepActionsProps) => {
	const {
		step,
		pushStep,
		popStep,
		validateStep,
		product,
		setProduct,
		baseProduct,
		setBaseProduct,
		feature,
		setFeature,
		diff,
		selectedProductId,
		setSelectedProductId,
		productCreatedRef,
		featureCreatedRef,
		handleRefetch,
		refetchProducts,
		refetchFeatures,
		setSheet,
		setEditingState,
		setIsLoading,
	} = props;

	const navigate = useNavigate();
	const env = useEnv();
	const axiosInstance = useAxiosInstance();

	// Step-specific action hooks
	const planDetailsActions = usePlanDetailsActions({
		product,
		axiosInstance,
		productCreatedRef,
		setBaseProduct,
		setIsLoading,
	});

	const featureCreationActions = useFeatureCreationActions({
		feature,
		product,
		axiosInstance,
		featureCreatedRef,
		setFeature,
		setProduct,
		setBaseProduct,
		refetchFeatures,
		setIsLoading,
	});

	const featureConfigActions = useFeatureConfigActions({
		product,
		diff,
		axiosInstance,
		handleRefetch,
		setSheet,
		setEditingState,
	});

	// Shared actions
	const sharedActions = useSharedActions({
		step,
		baseProduct,
		selectedProductId,
		product,
		productCreatedRef,
		featureCreatedRef,
		axiosInstance,
		setBaseProduct,
		setSelectedProductId,
		setSheet,
		setEditingState,
		popStep,
		refetchProducts,
	});

	// Main navigation handler
	const handleNext = useCallback(async () => {
		if (!validateStep(step, product, feature)) return;

		const nextStep = getNextStep(step);
		let canProceed = true;

		// Set loading for steps 1 and 2
		if (
			step === OnboardingStep.PlanDetails ||
			step === OnboardingStep.FeatureCreation
		) {
			setIsLoading(true);
		}

		try {
			// Step 1: Create product
			if (step === OnboardingStep.PlanDetails) {
				canProceed = await planDetailsActions.handleProceed();
			}

			// Step 2: Create feature and add to product
			if (step === OnboardingStep.FeatureCreation) {
				canProceed = await featureCreationActions.handleProceed();
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
				navigateTo("/sandbox/products", navigate, env);
			}
		} finally {
			// Always clear loading state
			setIsLoading(false);
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
		navigate,
		env,
		setIsLoading,
	]);

	return {
		handleNext,
		handleBack: sharedActions.handleBack,
		handlePlanSelect: sharedActions.handlePlanSelect,
		onCreatePlanSuccess: sharedActions.onCreatePlanSuccess,
	};
};

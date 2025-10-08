import { type ProductV2 } from "@autumn/shared";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { useEnv } from "@/utils/envUtils";
import { OnboardingStep } from "../utils/onboardingUtils";
import { useStepActions } from "./actions/useStepActions";
import { useOnboardingData } from "./useOnboardingData";
import { useOnboardingFlow } from "./useOnboardingFlow";

export const useOnboardingLogic = () => {
	const navigate = useNavigate();
	const env = useEnv();
	const hasInitializedResumability = useRef(false);

	// Centralized UI state - keeping this here as discussed since it's shared across many components
	const [sheet, setSheet] = useState<string | null>(null);
	const [editingState, setEditingState] = useState<{
		type: "plan" | "feature" | null;
		id: string | null;
	}>({ type: null, id: null });

	// Use the focused hooks
	const flowHook = useOnboardingFlow();
	const dataHook = useOnboardingData();

	// Initialize with existing data ONLY if user has completed onboarding AND auto-skipped to playground
	// This ensures data seeding only happens when onboarding is fully complete (both products AND features exist)
	// Use ref to prevent re-initialization and API spam
	useEffect(() => {
		// Only initialize if ALL conditions are met:
		// 1. Not already initialized
		// 2. Onboarding is FULLY completed (hasCompletedOnboarding = products >= 1 AND features >= 1)
		// 3. Data is loaded
		// 4. User was auto-skipped to playground (step 4)
		// 5. In preview mode (not edit mode)
		// 6. ADDITIONAL SAFEGUARD: Explicitly verify that products and features exist
		if (
			!hasInitializedResumability.current &&
			flowHook.hasCompletedOnboarding &&
			!flowHook.isLoading &&
			flowHook.step === OnboardingStep.Playground &&
			flowHook.playgroundMode === "preview"
		) {
			// Additional safeguard: Double-check that we actually have both products and features
			// This prevents any edge cases where hasCompletedOnboarding might be true incorrectly
			if (
				dataHook.products &&
				dataHook.features &&
				dataHook.products.length >= 1 &&
				dataHook.features.length >= 1
			) {
				hasInitializedResumability.current = true;
				dataHook.initializeWithExistingData();
			}
		}
	}, [
		flowHook.hasCompletedOnboarding,
		flowHook.isLoading,
		flowHook.step,
		flowHook.playgroundMode,
		dataHook,
	]);

	// Auto-open edit-plan sheet when entering step 4 (Playground) in edit mode
	// Clear sheet when entering step 5 (Integration)
	useEffect(() => {
		if (
			flowHook.step === OnboardingStep.Playground &&
			flowHook.playgroundMode === "edit"
		) {
			setSheet("edit-plan");
			setEditingState({ type: "plan", id: null });
		} else if (flowHook.step === OnboardingStep.Integration) {
			setSheet(null);
			setEditingState({ type: null, id: null });
		}
	}, [flowHook.step, flowHook.playgroundMode]);

	// Create actions hook with all required props
	const stepActionsHook = useStepActions({
		step: flowHook.step,
		pushStep: flowHook.pushStep,
		popStep: flowHook.popStep,
		validateStep: flowHook.validateStep,
		product: dataHook.product as unknown as ProductV2,
		setProduct: dataHook.setProduct,
		baseProduct: dataHook.baseProduct,
		setBaseProduct: dataHook.setBaseProduct,
		feature: dataHook.feature,
		setFeature: dataHook.setFeature,
		diff: dataHook.diff,
		selectedProductId: dataHook.selectedProductId,
		setSelectedProductId: dataHook.setSelectedProductId,
		productCreatedRef: dataHook.productCreatedRef,
		featureCreatedRef: dataHook.featureCreatedRef,
		handleRefetch: dataHook.handleRefetch,
		refetchProducts: dataHook.refetchProducts,
		refetchFeatures: dataHook.refetchFeatures,
		setSheet,
		setEditingState,
		setIsLoading: dataHook.setIsLoading,
	});

	return {
		// Data
		product: dataHook.product,
		setProduct: dataHook.setProduct,
		diff: dataHook.diff,
		baseProduct: dataHook.baseProduct,
		feature: dataHook.feature,
		setFeature: dataHook.setFeature,
		step: flowHook.step,
		products: dataHook.products,
		selectedProductId: dataHook.selectedProductId,

		// UI State
		sheet,
		setSheet,
		editingState,
		setEditingState,
		playgroundMode: flowHook.playgroundMode,
		setPlaygroundMode: flowHook.setPlaygroundMode,
		isLoading: dataHook.isLoading,

		// Handlers
		handleNext: stepActionsHook.handleNext,
		handleBack: stepActionsHook.handleBack,
		handlePlanSelect: stepActionsHook.handlePlanSelect,
		onCreatePlanSuccess: stepActionsHook.onCreatePlanSuccess,
		handleRefetch: dataHook.handleRefetch,

		// Utils
		validateStep: flowHook.validateStep,
		navigate,
		env,
	};
};

import { useEffect, useRef } from "react";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { useProductsQuery } from "@/hooks/queries/useProductsQuery";
import { useSheetStore } from "@/hooks/stores/useSheetStore";
import { useOnboardingStore } from "../store/useOnboardingStore";
import { OnboardingStep } from "../utils/onboardingUtils";
import { useSharedActions } from "./actions/useSharedActions";
import { useStepActions } from "./actions/useStepActions";
import { useOnboardingFlow } from "./useOnboardingFlow";

/**
 * Main orchestrator for onboarding logic
 *
 * This hook handles side effects and auto-initialization.
 * Most state should be accessed directly from Zustand in components!
 *
 * Only returns action handlers (handleNext, handleBack, etc.)
 */
export const useOnboardingLogic = () => {
	const hasInitializedResumability = useRef(false);

	// Get queries
	const { products, refetch: refetchProducts } = useProductsQuery();
	const { features } = useFeaturesQuery();

	// Set isOnboarding flag on mount
	useEffect(() => {
		const { setIsOnboarding } = useOnboardingStore.getState();
		setIsOnboarding(true);

		return () => {
			setIsOnboarding(false);
		};
	}, []);

	// Get flow state
	const flowHook = useOnboardingFlow();

	// Get state from sheet store
	const setSheet = useSheetStore((s) => s.setSheet);
	const closeSheet = useSheetStore((s) => s.closeSheet);

	// Initialize shared actions (handles plan selection, back navigation, etc.)
	const sharedActions = useSharedActions({
		step: flowHook.step,
		popStep: flowHook.popStep,
		refetchProducts,
		products: products || [],
	});

	// Initialize with existing data ONLY if user has completed onboarding AND auto-skipped to playground
	useEffect(() => {
		if (
			!hasInitializedResumability.current &&
			flowHook.hasCompletedOnboarding &&
			!flowHook.isLoading &&
			flowHook.step === OnboardingStep.Playground &&
			flowHook.playgroundMode === "preview"
		) {
			// Additional safeguard: Double-check that we actually have both products and features
			if (
				products &&
				features &&
				products.length >= 1 &&
				features.length >= 1
			) {
				hasInitializedResumability.current = true;
			}
		}
	}, [
		flowHook.hasCompletedOnboarding,
		flowHook.isLoading,
		flowHook.step,
		flowHook.playgroundMode,
		products,
		features,
	]);

	// Auto-open edit-plan sheet when entering step 4 (Playground) in edit mode
	// Close sheet when leaving step 4 or entering Integration
	useEffect(() => {
		if (
			flowHook.step === OnboardingStep.Playground &&
			flowHook.playgroundMode === "edit"
		) {
			setSheet({ type: "edit-plan" });
		} else if (
			flowHook.step === OnboardingStep.Integration ||
			flowHook.step === OnboardingStep.FeatureConfiguration
		) {
			closeSheet();
		}
	}, [flowHook.step, flowHook.playgroundMode, setSheet, closeSheet]);

	// Create actions hook (pass shared actions)
	const stepActionsHook = useStepActions({
		step: flowHook.step,
		pushStep: flowHook.pushStep,
		popStep: flowHook.popStep,
		validateStep: flowHook.validateStep,
		sharedActions,
	});

	// Set handlers in store so components can access them directly
	useEffect(() => {
		const {
			setHandleNext,
			setHandleBack,
			setHandlePlanSelect,
			setOnCreatePlanSuccess,
			setHandleDeletePlanSuccess,
			setValidateStep,
		} = useOnboardingStore.getState();

		setHandleNext(stepActionsHook.handleNext);
		setHandleBack(stepActionsHook.handleBack);
		setHandlePlanSelect(stepActionsHook.handlePlanSelect);
		setOnCreatePlanSuccess(stepActionsHook.onCreatePlanSuccess);
		setHandleDeletePlanSuccess(sharedActions.handleDeletePlanSuccess);
		setValidateStep(flowHook.validateStep);
	}, [
		stepActionsHook.handleNext,
		stepActionsHook.handleBack,
		stepActionsHook.handlePlanSelect,
		stepActionsHook.onCreatePlanSuccess,
		sharedActions.handleDeletePlanSuccess,
		flowHook.validateStep,
	]);
};

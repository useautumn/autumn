import { useCallback, useEffect, useMemo, useState } from "react";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { useProductsQuery } from "@/hooks/queries/useProductsQuery";
import { useOnboarding3QueryState } from "./useOnboarding3QueryState";
import { useOnboardingSteps } from "./useOnboardingSteps";

interface OnboardingFlowState {
	playgroundMode: "edit" | "preview";
	hasCompletedOnboarding: boolean;
}

export const useOnboardingFlow = () => {
	const { features, isLoading: featuresLoading } = useFeaturesQuery();
	const { products, isLoading: productsLoading } = useProductsQuery();
	const { queryStates, setQueryStates } = useOnboarding3QueryState();
	const { validateStep } = useOnboardingSteps();

	const [flowState, setFlowState] = useState<OnboardingFlowState>({
		playgroundMode: "edit",
		hasCompletedOnboarding: false,
	});

	// Check if user has completed onboarding
	const hasCompletedOnboarding = useMemo(() => {
		if (productsLoading || featuresLoading || !products || !features) {
			return false;
		}
		return products.length >= 1 && features.length >= 1;
	}, [products, features, productsLoading, featuresLoading]);

	// Update flow state when onboarding completion status changes
	useEffect(() => {
		setFlowState((prev) => ({
			...prev,
			hasCompletedOnboarding,
		}));
	}, [hasCompletedOnboarding]);

	// Auto-skip to playground if user has completed onboarding
	// NOTE: Commented out as per user request - may be used later
	// useEffect(() => {
	// 	if (onboardingProcessed.current || productsLoading || featuresLoading) {
	// 		return;
	// 	}

	// 	if (hasCompletedOnboarding) {
	// 		// Jump directly to step 4 (Playground) in preview mode
	// 		pushStep(OnboardingStep.FeatureCreation);
	// 		pushStep(OnboardingStep.FeatureConfiguration);
	// 		pushStep(OnboardingStep.Playground);

	// 		setFlowState((prev) => ({
	// 			...prev,
	// 			playgroundMode: "preview",
	// 		}));
	// 	}

	// 	onboardingProcessed.current = true;
	// }, [hasCompletedOnboarding, productsLoading, featuresLoading, pushStep]);

	const pushStep = useCallback(
		(step: typeof queryStates.step) => {
			setQueryStates({ step });
		},
		[setQueryStates],
	);

	const popStep = useCallback(() => {
		// Implement backwards navigation based on current step
		const stepOrder = [
			"plan_details",
			"feature_creation",
			"feature_configuration",
			"playground",
			"integration",
		];
		const currentIndex = stepOrder.indexOf(queryStates.step);
		if (currentIndex > 0) {
			setQueryStates({
				step: stepOrder[currentIndex - 1] as typeof queryStates.step,
			});
		}
	}, [queryStates.step, setQueryStates]);

	const setPlaygroundMode = useCallback((mode: "edit" | "preview") => {
		setFlowState((prev) => ({
			...prev,
			playgroundMode: mode,
		}));
	}, []);

	return {
		step: queryStates.step,
		pushStep,
		popStep,
		validateStep,
		playgroundMode: flowState.playgroundMode,
		setPlaygroundMode,
		hasCompletedOnboarding: flowState.hasCompletedOnboarding,
		isLoading: productsLoading || featuresLoading,
	};
};

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { useProductsQuery } from "@/hooks/queries/useProductsQuery";
import { OnboardingStep } from "../utils/onboardingUtils";
import { useOnboardingSteps } from "./useOnboardingSteps";

interface OnboardingFlowState {
	playgroundMode: "edit" | "preview";
	hasCompletedOnboarding: boolean;
}

export const useOnboardingFlow = () => {
	const { features, isLoading: featuresLoading } = useFeaturesQuery();
	const { products, isLoading: productsLoading } = useProductsQuery();
	const { step, pushStep, popStep, validateStep } = useOnboardingSteps();

	const [flowState, setFlowState] = useState<OnboardingFlowState>({
		playgroundMode: "edit",
		hasCompletedOnboarding: false,
	});

	const onboardingProcessed = useRef(false);

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
	useEffect(() => {
		if (onboardingProcessed.current || productsLoading || featuresLoading) {
			return;
		}

		if (hasCompletedOnboarding) {
			// Jump directly to step 4 (Playground) in preview mode
			pushStep(OnboardingStep.FeatureCreation);
			pushStep(OnboardingStep.FeatureConfiguration);
			pushStep(OnboardingStep.Playground);

			setFlowState((prev) => ({
				...prev,
				playgroundMode: "preview",
			}));
		}

		onboardingProcessed.current = true;
	}, [hasCompletedOnboarding, productsLoading, featuresLoading, pushStep]);

	const setPlaygroundMode = useCallback((mode: "edit" | "preview") => {
		setFlowState((prev) => ({
			...prev,
			playgroundMode: mode,
		}));
	}, []);

	return {
		step,
		pushStep,
		popStep,
		validateStep,
		playgroundMode: flowState.playgroundMode,
		setPlaygroundMode,
		hasCompletedOnboarding: flowState.hasCompletedOnboarding,
		isLoading: productsLoading || featuresLoading,
	};
};

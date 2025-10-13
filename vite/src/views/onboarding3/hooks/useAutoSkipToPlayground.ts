import { useEffect, useRef, useState } from "react";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { useProductStore } from "@/hooks/stores/useProductStore";
import { OnboardingStep } from "../utils/onboardingUtils";
import { useOnboarding3QueryState } from "./useOnboarding3QueryState";

/**
 * Hook to detect if steps 1-3 are complete and auto-skip to Step 4 (Playground)
 *
 * Checks if user has:
 * 1. A product
 * 2. A feature
 * 3. A feature item in the product that references the feature
 *
 * If all conditions are met AND user is on Step 1 on initial load, automatically redirect to Step 4
 * Will NOT skip if user navigates back to step 1 from other steps
 *
 * Returns isChecking: true while checking if auto-skip should happen
 */
export const useAutoSkipToPlayground = () => {
	const { queryStates, setQueryStates } = useOnboarding3QueryState();
	const { features } = useFeaturesQuery();
	const product = useProductStore((s) => s.product);

	const hasCheckedOnMount = useRef(false);
	const initialStep = useRef(queryStates.step);
	// Initialize to true if we're starting on Step 1 (Plan Details)
	const [isChecking, setIsChecking] = useState(
		queryStates.step === OnboardingStep.PlanDetails,
	);

	useEffect(() => {
		// Only check once on mount, and only if we started on step 1
		if (hasCheckedOnMount.current) return;
		if (initialStep.current !== OnboardingStep.PlanDetails) return;
		if (queryStates.step !== OnboardingStep.PlanDetails) return;

		// Set checking state to true while we wait for data
		if (!product?.id || !features) {
			setIsChecking(true);
			return;
		}

		// Mark as checked so we never run this again (only after data is loaded)
		hasCheckedOnMount.current = true;

		// Check all conditions
		const hasProduct = product?.id !== undefined;
		const hasFeature = features && features.length > 0;
		const hasFeatureItem =
			hasProduct &&
			hasFeature &&
			product.items?.some(
				(item) =>
					item.feature_id &&
					!item.price_id &&
					features.some((f) => f.id === item.feature_id),
			);

		// If all conditions met, skip to playground
		if (hasProduct && hasFeature && hasFeatureItem) {
			setQueryStates({ step: OnboardingStep.Playground });
		}

		// Done checking
		setIsChecking(false);
	}, [queryStates.step, product?.id, product?.items, features, setQueryStates]);

	return { isChecking };
};

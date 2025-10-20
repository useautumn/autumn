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
	const { features, isLoading: featuresLoading } = useFeaturesQuery();
	const product = useProductStore((s) => s.product);

	const hasPerformedCheck = useRef(false);
	const initialStep = useRef(queryStates.step);
	// Initialize to true if we're starting on Step 1 (Plan Details)
	const [isChecking, setIsChecking] = useState(
		queryStates.step === OnboardingStep.PlanDetails,
	);

	useEffect(() => {
		// If we're not on the initial step or not on PlanDetails, we're not checking
		if (initialStep.current !== OnboardingStep.PlanDetails) {
			setIsChecking(false);
			return;
		}

		if (queryStates.step !== OnboardingStep.PlanDetails) {
			setIsChecking(false);
			return;
		}

		// Only perform the check once when we have data
		if (hasPerformedCheck.current) {
			return;
		}

		// If features are still loading, wait
		if (featuresLoading) {
			return;
		}

		// Features have loaded (even if empty array), now we can check
		// For empty orgs: product will be undefined/null and features will be empty array
		hasPerformedCheck.current = true;

		// If no product exists (empty org), we can't skip - show Step 1
		if (!product?.id) {
			setIsChecking(false);
			return;
		}

		// Check all conditions
		const hasProduct = product?.id !== undefined;
		const hasFeature = features && features.length > 0;
		const hasFeatureItem =
			hasProduct &&
			hasFeature &&
			product.items?.some(
				(item) =>
					item.feature_id && features.some((f) => f.id === item.feature_id),
			);

		if (hasProduct && hasFeature && !hasFeatureItem) {
			setQueryStates({ step: OnboardingStep.FeatureConfiguration });
		}

		setIsChecking(false);
	}, [
		product?.id,
		product?.items,
		features,
		featuresLoading,
		setQueryStates,
		queryStates.step,
	]);

	return { isChecking };
};

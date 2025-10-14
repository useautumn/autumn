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

	console.log("Called useAutoSkipToPlayground()", isChecking);
	useEffect(() => {
		console.log("inside useAutoSkipToPlayground()");

		// If we're not on the initial step or not on PlanDetails, we're not checking
		if (initialStep.current !== OnboardingStep.PlanDetails) {
			console.log(
				"Skipping as initial step ",
				initialStep.current,
				" is not ",
				OnboardingStep.PlanDetails,
			);
			setIsChecking(false);
			return;
		}

		if (queryStates.step !== OnboardingStep.PlanDetails) {
			console.log(
				"Skipping as current step ",
				queryStates.step,
				" is not ",
				OnboardingStep.PlanDetails,
			);
			setIsChecking(false);
			return;
		}

		// Only perform the check once when we have data
		if (hasPerformedCheck.current) {
			console.log("Already performed check");
			return;
		}

		// If features are still loading, wait
		if (featuresLoading) {
			console.log("Features still loading, waiting...");
			return;
		}

		// Features have loaded (even if empty array), now we can check
		// For empty orgs: product will be undefined/null and features will be empty array
		hasPerformedCheck.current = true;

		// If no product exists (empty org), we can't skip - show Step 1
		if (!product?.id) {
			console.log("No product found - showing Step 1 for empty org");
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
					item.feature_id &&
					!item.price_id &&
					features.some((f) => f.id === item.feature_id),
			);

		console.log("Checking conditions - hasProduct:", hasProduct, "hasFeature:", hasFeature, "hasFeatureItem:", hasFeatureItem);

		// If all conditions met, skip to playground
		if (hasProduct && hasFeature && hasFeatureItem) {
			console.log("All conditions met - skipping to playground");
			setQueryStates({ step: OnboardingStep.Playground });
		}

		// Done checking - always set to false after we've checked
		console.log("Done checking - setting isChecking to false");
		setIsChecking(false);
	}, [product?.id, features, featuresLoading, setQueryStates, queryStates.step]);

	return { isChecking };
};

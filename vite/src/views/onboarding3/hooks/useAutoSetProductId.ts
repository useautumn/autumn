import { useEffect, useRef } from "react";
import { useProductStore } from "@/hooks/stores/useProductStore";
import { OnboardingStep } from "../utils/onboardingUtils";
import { useOnboarding3QueryState } from "./useOnboarding3QueryState";

/**
 * Auto-sets product_id in query params when entering the playground step
 * This prevents product switching when the products array order changes
 */
export const useAutoSetProductId = () => {
	const { queryStates, setQueryStates } = useOnboarding3QueryState();
	const baseProduct = useProductStore((s) => s.baseProduct);
	const hasSetProductId = useRef(false);

	useEffect(() => {
		// Only run in playground step
		if (queryStates.step !== OnboardingStep.Playground) {
			return;
		}

		// If product_id is already set in query params, don't override it
		if (queryStates.product_id) {
			hasSetProductId.current = true;
			return;
		}

		// If we have a baseProduct and haven't set the product_id yet, set it
		if (baseProduct?.id && !hasSetProductId.current) {
			setQueryStates({ product_id: baseProduct.id });
			hasSetProductId.current = true;
		}
	}, [
		queryStates.step,
		queryStates.product_id,
		baseProduct?.id,
		setQueryStates,
	]);
};

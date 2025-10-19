import { useInitProductAndFeature } from "./useInitProductAndFeature";

/**
 * Hook to manage onboarding initialization
 *
 * Key architecture:
 * - Product state is managed in useProductStore (baseProduct and working product)
 * - This hook just initializes the feature item for step 3
 */
export const useOnboardingData = () => {
	useInitProductAndFeature();
};

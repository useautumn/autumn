/**
 * Hook that was previously used to auto-skip to playground if steps 1-3 were complete.
 * Now disabled since onboarding always creates a new product from scratch.
 *
 * Returns isChecking: false (never checking since we always start fresh)
 */
export const useAutoSkipToPlayground = () => {
	// Onboarding always starts fresh - no auto-skipping
	return { isChecking: false };
};

/**
 * Check if a URL is an Autumn checkout URL.
 * Autumn checkout URLs contain "/c/co" in the path.
 */
export const isAutumnCheckoutUrl = (url: string): boolean => {
	return url.includes("/c/co");
};

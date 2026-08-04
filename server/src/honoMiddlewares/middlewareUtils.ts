/**
 * Checks if an actual URL matches a route pattern with parameters
 *
 * @example
 * matchRoute({
 *   url: "/customers/cus_123",
 *   method: "GET",
 *   pattern: { url: "/customers/:customer_id", method: "GET" }
 * }) // Returns true
 *
 * matchRoute({
 *   url: "/customers/cus_123/events",
 *   method: "GET",
 *   pattern: { url: "/customers/:customer_id", method: "GET" }
 * }) // Returns false
 */
// Called dozens of times per request across middleware configs; patterns are
// static, so compile each one once.
const routeRegexCache = new Map<string, RegExp>();

const getRouteRegex = (patternUrl: string): RegExp => {
	const cached = routeRegexCache.get(patternUrl);
	if (cached) {
		return cached;
	}

	// Convert route pattern to regex
	// "/customers/:customer_id" -> "^\/customers\/([^/]+)$"
	const regexPattern = patternUrl
		.replace(/:[^/]+/g, "([^/]+)") // Replace :param with capturing group
		.replace(/\//g, "\\/"); // Escape forward slashes

	const regex = new RegExp(`^${regexPattern}$`);
	routeRegexCache.set(patternUrl, regex);
	return regex;
};

export const matchRoute = ({
	url,
	method,
	pattern,
}: {
	url: string;
	method: string;
	pattern: { url: string; method: string };
}): boolean => {
	// Check if method matches
	if (pattern.method !== method) {
		return false;
	}

	return getRouteRegex(pattern.url).test(url);
};

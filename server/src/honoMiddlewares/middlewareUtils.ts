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

	// Convert route pattern to regex
	// "/customers/:customer_id" -> "^\/customers\/([^/]+)$"
	const regexPattern = pattern.url
		.replace(/:[^/]+/g, "([^/]+)") // Replace :param with capturing group
		.replace(/\//g, "\\/"); // Escape forward slashes

	const regex = new RegExp(`^${regexPattern}$`);
	return regex.test(url);
};

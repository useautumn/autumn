/**
 * Centralized customer ID resolution from all possible request sources.
 * Called once in baseMiddleware so ctx.customerId is available early
 * in the middleware chain (before Redis routing, analytics, rate limiting).
 */
export const resolveCustomerId = ({
	method,
	path,
	body,
	query,
}: {
	method: string;
	path: string;
	body?: Record<string, unknown>;
	query?: Record<string, string>;
}): string | undefined => {
	// 1. URL path: /v1/.../customers/{customer_id}/...
	const urlCustomerId = parseCustomerIdFromPath(path);
	if (urlCustomerId) return urlCustomerId;

	// 2. Body: customer_id (most RPC and POST routes)
	if (body && (method === "POST" || method === "PUT" || method === "PATCH")) {
		// Special case: POST /v1/customers uses `id` not `customer_id`
		const isCreateCustomerPath =
			path.startsWith("/v1/customers") &&
			method === "POST" &&
			!path.includes("customers.get_or_create");

		const bodyCustomerId = isCreateCustomerPath
			? (body.id as string | undefined)
			: (body.customer_id as string | undefined);

		if (bodyCustomerId) return bodyCustomerId;
	}

	// 3. Query param: customer_id (for GET routes like /balances/list, /components/pricing_table)
	if (query?.customer_id) return query.customer_id;

	return undefined;
};

/** Parses customer_id from URL path segments like /v1/.../customers/{customer_id}/... */
const parseCustomerIdFromPath = (path: string): string | undefined => {
	if (!path.startsWith("/v1")) return undefined;

	const cleanPath = path.split("?")[0].replace(/^\/+|\/+$/g, "");
	const segments = cleanPath.split("/");
	const customersIndex = segments.indexOf("customers");

	if (customersIndex !== -1 && segments[customersIndex + 1]) {
		return segments[customersIndex + 1];
	}

	return undefined;
};

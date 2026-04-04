/**
 * Centralized customer ID resolution from all possible request sources.
 * Called once in baseMiddleware so ctx.customerId is available early
 * in the middleware chain (before rollout routing, analytics, rate limiting).
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
	const urlCustomerId = parseCustomerIdFromPath({ path });
	if (urlCustomerId) return urlCustomerId;

	if (body && (method === "POST" || method === "PUT" || method === "PATCH")) {
		const isCreateCustomerPath =
			path.startsWith("/v1/customers") &&
			method === "POST" &&
			!path.includes("customers.get_or_create");

		const bodyCustomerId = isCreateCustomerPath
			? (body.id as string | undefined)
			: (body.customer_id as string | undefined);

		if (bodyCustomerId) return bodyCustomerId;
	}

	if (query?.customer_id) return query.customer_id;

	return undefined;
};

const parseCustomerIdFromPath = ({
	path,
}: {
	path: string;
}): string | undefined => {
	if (!path.startsWith("/v1")) return undefined;

	const cleanPath = path.split("?")[0].replace(/^\/+|\/+$/g, "");
	const segments = cleanPath.split("/");
	const customersIndex = segments.indexOf("customers");

	if (customersIndex !== -1 && segments[customersIndex + 1])
		return segments[customersIndex + 1];

	return undefined;
};

import { getV1PathSegmentAfter } from "./resolvePathSegment.js";

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
	body?: unknown;
	query?: Record<string, string>;
}): string | undefined => {
	const urlCustomerId = parseCustomerIdFromPath({ path });
	if (urlCustomerId) return urlCustomerId;

	if (
		body &&
		typeof body === "object" &&
		!Array.isArray(body) &&
		(method === "POST" || method === "PUT" || method === "PATCH")
	) {
		const isCreateCustomerPath = method === "POST" && path === "/v1/customers";
		const parsedBody = body as Record<string, unknown>;

		const bodyCustomerId = isCreateCustomerPath
			? (parsedBody.id as string | undefined)
			: (parsedBody.customer_id as string | undefined);

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
	return getV1PathSegmentAfter({
		path,
		segment: "customers",
	});
};

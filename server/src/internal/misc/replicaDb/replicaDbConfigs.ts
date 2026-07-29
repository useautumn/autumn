import { matchRoute } from "@/honoMiddlewares/middlewareUtils.js";

type RoutePattern = {
	method: string;
	url: string;
	/** Omit to always use the replica; set to decide from the request body. */
	useReplicaForBody?: (body: unknown) => boolean;
};

const route = (pattern: RoutePattern): RoutePattern => pattern;

const isCustomerScoped = (body: unknown) => {
	if (typeof body !== "object" || body === null) return false;

	const customerId = (body as { customer_id?: unknown }).customer_id;
	return typeof customerId === "string" && customerId.trim().length > 0;
};

const REPLICA_ROUTE_PATTERNS: RoutePattern[] = [
	route({ method: "POST", url: "/v1/customers/list" }),
	route({ method: "POST", url: "/v1/customers.list" }),

	// Callers list a customer's entities right after creating one, so a lagging
	// replica returns a stale page. Only unscoped org-wide listing is shed.
	route({
		method: "POST",
		url: "/v1/entities.list",
		useReplicaForBody: (body) => !isCustomerScoped(body),
	}),
];

export const shouldUseReplicaDb = async ({
	method,
	path,
	readBody,
}: {
	method: string;
	path: string;
	readBody: () => Promise<unknown>;
}): Promise<boolean> => {
	const matched = REPLICA_ROUTE_PATTERNS.find((pattern) =>
		matchRoute({ url: path, method, pattern }),
	);

	if (!matched) return false;
	if (!matched.useReplicaForBody) return true;

	let body: unknown;
	try {
		body = await readBody();
	} catch {
		// An unreadable body can't be proven unscoped, so keep the primary.
		return false;
	}

	return matched.useReplicaForBody(body);
};

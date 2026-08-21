import { matchRoute } from "@/honoMiddlewares/middlewareUtils.js";

/** "default" rides the 5s outage-fallback pool; "slow" is the small
 * long-query pool for dashboard aggregates that legitimately run seconds. */
export type ReplicaDbLane = "default" | "slow";

type RoutePattern = {
	method: string;
	url: string;
	lane?: ReplicaDbLane;
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

	// Dashboard migration preview: exact counts + filtered pages over
	// multi-million-customer orgs; replica lag only staleness a dashboard absorbs.
	route({ method: "POST", url: "/migrations.filter.preview", lane: "slow" }),
];

export const resolveReplicaDbLane = async ({
	method,
	path,
	readBody,
}: {
	method: string;
	path: string;
	readBody: () => Promise<unknown>;
}): Promise<ReplicaDbLane | null> => {
	const matched = REPLICA_ROUTE_PATTERNS.find((pattern) =>
		matchRoute({ url: path, method, pattern }),
	);

	if (!matched) return null;
	const lane = matched.lane ?? "default";
	if (!matched.useReplicaForBody) return lane;

	let body: unknown;
	try {
		body = await readBody();
	} catch {
		// An unreadable body can't be proven unscoped, so keep the primary.
		return null;
	}

	return matched.useReplicaForBody(body) ? lane : null;
};

import type { Context } from "hono";
import { matchRoute } from "@/honoMiddlewares/middlewareUtils.js";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";

type RoutePattern = {
	method: string;
	url: string;
};

const route = ({ method, url }: RoutePattern): RoutePattern => ({
	method,
	url,
});

const REPLICA_ROUTE_PATTERNS: RoutePattern[] = [
	route({ method: "POST", url: "/v1/customers/list" }),
	route({ method: "POST", url: "/v1/customers.list" }),
];

export const shouldUseReplicaDb = (c: Context<HonoEnv>) => {
	const method = c.req.method;
	const path = c.req.path;

	return REPLICA_ROUTE_PATTERNS.some((pattern) =>
		matchRoute({ url: path, method, pattern }),
	);
};

import { addRoute, createRouter, type RouterContext } from "rou3";
import type { RouteDefinition } from "../types";

export type RouteMatch = {
	route: RouteDefinition;
};

/** Build a rou3 router from route definitions */
export const buildRouter = ({
	pathPrefix,
	routes,
}: {
	pathPrefix: string;
	routes: RouteDefinition[];
}): RouterContext<RouteMatch> => {
	const router = createRouter<RouteMatch>();

	for (const route of routes) {
		// Convert "billing.attach" to "/api/autumn/billing.attach"
		const fullPath = `${pathPrefix}/${route.route}`;

		addRoute(router, "POST", fullPath, { route });
	}

	return router;
};

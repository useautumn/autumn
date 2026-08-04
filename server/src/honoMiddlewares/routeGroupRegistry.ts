import type { RouteGroup } from "@autumn/shared";
import type { Context } from "hono";
import { matchedRoutes } from "hono/route";

/** createRoute registers its terminal handler here when the route declares a
 *  routeGroup — router-level middlewares (which run before the handler) can
 *  then resolve the group via Hono's matched routes. */
const registry = new WeakMap<object, RouteGroup>();

export const registerRouteGroup = ({
	handler,
	routeGroup,
}: {
	handler: object;
	routeGroup: RouteGroup;
}): void => {
	registry.set(handler, routeGroup);
};

/** The RouteGroup declared by the matched route's createRoute config, or
 *  null when the route doesn't declare one. */
export const getRouteGroup = (c: Context): RouteGroup | null => {
	for (const route of matchedRoutes(c)) {
		const group = registry.get(route.handler as object);
		if (group !== undefined) return group;
	}
	return null;
};

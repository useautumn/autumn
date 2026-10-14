import type { RouteGroup } from "@autumn/shared";
import type { Context } from "hono";
import { matchedRoutes } from "hono/route";

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

export const getRouteGroup = (c: Context): RouteGroup | null => {
	for (const route of matchedRoutes(c)) {
		const group = registry.get(route.handler as object);
		if (group !== undefined) return group;
	}
	return null;
};

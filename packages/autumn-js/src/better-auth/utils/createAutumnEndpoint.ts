import { createAuthEndpoint } from "better-auth/plugins";

import { routeConfigs } from "../../backend/core/routes/routeConfigs";
import type { RouteName } from "../../backend/core/types";

/** Type for the handleRoute function used by better-auth endpoints */
export type HandleBetterAuthRouteFn = (args: {
	ctx: unknown;
	routeName: RouteName;
}) => Promise<{ status: number; body: unknown }>;

/** Get route config by name from routeConfigs */
const getRouteConfig = (routeName: RouteName) => {
	const route = routeConfigs.find((r) => r.route === routeName);
	if (!route) throw new Error(`Route not found: ${routeName}`);
	return route;
};

/**
 * Creates a better-auth endpoint for a given route name.
 * Each route needs its own call to preserve TypeScript literal types for the path.
 */
export const createAutumnEndpoint = <T extends RouteName>(
	routeName: T,
	handleRoute: HandleBetterAuthRouteFn,
) => {
	const config = getRouteConfig(routeName);
	return createAuthEndpoint(
		`/autumn/${routeName}` as `/autumn/${T}`,
		{
			method: "POST",
			body: config.bodySchema,
		},
		async (ctx) => {
			const result = await handleRoute({ ctx, routeName });
			return ctx.json(result.body as Record<string, unknown> | null, {
				status: result.status,
			});
		},
	);
};

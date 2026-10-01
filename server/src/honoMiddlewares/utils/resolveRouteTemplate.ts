import type { Context } from "hono";
import { routePath } from "hono/route";

/** The terminal route's template; an unmatched request (only wildcard middleware) keeps its concrete path. */
export const resolveRouteTemplate = ({ c }: { c: Context }) => {
	const template = routePath(c, -1);
	return template.endsWith("*") ? c.req.path : template;
};

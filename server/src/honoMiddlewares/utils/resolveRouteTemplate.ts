import type { Context } from "hono";
import { routePath } from "hono/route";

export const resolveRouteTemplate = ({ c }: { c: Context }) => {
	const template = routePath(c, -1);
	return template.endsWith("*") ? c.req.path : template;
};

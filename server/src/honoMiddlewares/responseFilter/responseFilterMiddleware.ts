import { AuthType, stripInternalFields } from "@autumn/shared";
import type { Context, Next } from "hono";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";

/**
 * Middleware that filters internal fields from JSON responses.
 *
 * Runs after the handler completes, parses the JSON response,
 * recursively strips fields marked as internal based on object type,
 * and replaces the response with the filtered version.
 */
export const responseFilterMiddleware = async (
	c: Context<HonoEnv>,
	next: Next,
) => {
	await next();

	// Skip filtering for dashboard requests
	const ctx = c.get("ctx");
	if (ctx?.authType === AuthType.Dashboard) return;
	const isNonProd =
		process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test";
	if (isNonProd && ctx?.testOptions?.keepInternalFields === true) return;

	// Only process JSON responses
	const contentType = c.res.headers.get("content-type");
	if (!contentType?.includes("application/json")) return;

	// Only process successful responses
	if (c.res.status < 200 || c.res.status >= 300) return;

	try {
		const cloned = c.res.clone();
		const body = await cloned.json();
		const filtered = stripInternalFields({ data: body });

		c.res = new Response(JSON.stringify(filtered), {
			status: c.res.status,
			headers: c.res.headers,
		});
	} catch {
		// If parsing fails, leave response unchanged
	}
};

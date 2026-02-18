import type { Context, Next } from "hono";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import { responseFilterConfig } from "./responseFilterConfig.js";

/**
 * Recursively strips internal fields from response data based on object type.
 * Uses the `object` field to identify which filter rules to apply.
 */
function stripInternalFields({ data }: { data: unknown }): unknown {
	if (data === null || typeof data !== "object") return data;

	if (Array.isArray(data)) {
		return data.map((item) => stripInternalFields({ data: item }));
	}

	const obj = data as Record<string, unknown>;
	const objectType = obj.object;

	// Get fields to omit for this object type
	const fieldsToOmit =
		typeof objectType === "string"
			? (responseFilterConfig[objectType] ?? [])
			: [];

	const result: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(obj)) {
		if (fieldsToOmit.includes(key)) continue;
		result[key] = stripInternalFields({ data: value });
	}

	return result;
}

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

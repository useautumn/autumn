import type { Context, Next } from "hono";
import { type AuthResult, createCoreHandler } from "../core";

export type HonoAutumnHandlerOptions<ContextType extends Context = Context> = {
	/** Function to identify the customer from the Hono context */
	identify: (c: ContextType) => AuthResult;
	/** Autumn API secret key */
	secretKey?: string;
	/** Autumn API URL */
	autumnURL?: string;
	/** Path prefix for routes (default: "/api/autumn") */
	pathPrefix?: string;
};

export function autumnHandler<ContextType extends Context = Context>(
	options: HonoAutumnHandlerOptions<ContextType>,
) {
	const core = createCoreHandler({
		identify: (raw) => options.identify(raw as ContextType),
		secretKey: options.secretKey,
		autumnURL: options.autumnURL,
		pathPrefix: options.pathPrefix,
	});

	return async (c: Context, next: Next) => {
		const url = new URL(c.req.url);

		let body: unknown = null;
		if (["POST", "PUT", "PATCH"].includes(c.req.method)) {
			try {
				body = await c.req.json();
			} catch {
				body = null;
			}
		}

		const result = await core({
			method: c.req.method,
			path: url.pathname,
			body,
			raw: c,
		});

		// If route not found (404), pass to next middleware
		if (
			result.status === 404 &&
			(result.body as { code?: string })?.code === "not_found"
		) {
			return next();
		}

		// 204 No Content
		if (result.status === 204) {
			return c.body(null, 204);
		}

		// Return body directly with actual HTTP status
		return c.json(result.body, result.status as 200);
	};
}

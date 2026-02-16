import { Autumn } from "@sdk";
import type { Context, Next } from "hono";
import { findRoute } from "rou3";
import { autumnApiUrl } from "./constants";
import { createRouterWithOptions } from "./routes/backendRouter";
import type { AuthResult } from "./utils/AuthFunction";
import { secretKeyCheck } from "./utils/secretKeyCheck";

export const autumnHandler = <ContextType extends Context = Context>(options: {
	identify: (c: ContextType) => AuthResult;
	baseURL?: string;
	version?: string;
	secretKey?: string;
}) => {
	const autumn = new Autumn({
		serverURL: options.baseURL || autumnApiUrl,
		apiVersion: options.version,
	});

	const router = createRouterWithOptions();

	const { found, error: resError } = secretKeyCheck(options?.secretKey);
	return async (c: Context, next: Next) => {
		if (!found && !options.secretKey) {
			return c.json(resError!, 500);
		}

		const request = new URL(c.req.url);
		const path = request.pathname;

		const searchParams = Object.fromEntries(request.searchParams);
		const match = findRoute(router, c.req.method, path);

		if (match) {
			const { data, params: pathParams } = match;
			const { handler } = data;

			let body = null;
			if (
				c.req.method === "POST" ||
				c.req.method === "PUT" ||
				c.req.method === "PATCH"
			) {
				try {
					body = await c.req.json();
				} catch (error) {}
			}

			const result = await handler({
				autumn,
				body,
				path: c.req.path,
				getCustomer: async () => {
					return await options.identify(c as ContextType);
				},
				pathParams,
				searchParams,
			});

			if (result.statusCode === 204) {
				return new Response(null, { status: 204 });
			}

			return c.json(result.body, result.statusCode);
		}

		await next();
	};
};

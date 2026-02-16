import { Autumn } from "@sdk";
import { json } from "@tanstack/react-start";
import { findRoute } from "rou3";
import { autumnApiUrl } from "./constants";
import { createRouterWithOptions } from "./routes/backendRouter";
import type { AuthResult } from "./utils/AuthFunction";
import { secretKeyCheck } from "./utils/secretKeyCheck";

// Create a factory function for your Autumn handler
export const autumnHandler = (options: {
	identify: (ctx: { request: any }) => AuthResult;
	apiVersion?: string;
	secretKey?: string;
}) => {
	const autumn = new Autumn({
		serverURL: autumnApiUrl,
		apiVersion: options.apiVersion,
	});

	const router = createRouterWithOptions();

	const { found, error: resError } = secretKeyCheck(options?.secretKey);

	// Generic handler function that works with any HTTP method
	const handleRequest = async (ctx: { request: Request; params: any }) => {
		const { request } = ctx;

		if (!found && !options.secretKey) {
			return new Response(JSON.stringify(resError!), {
				status: resError!.statusCode,
			});
		}

		const url = new URL(request.url);
		const searchParams = Object.fromEntries(url.searchParams);
		const pathname = url.pathname;

		const method = request.method;
		const match = findRoute(router, method, pathname);

		if (!match) {
			return new Response(
				JSON.stringify({
					message: "Not found",
					code: "not_found",
					statusCode: 404,
				}),
				{
					status: 404,
					headers: { "Content-Type": "application/json" },
				},
			);
		}

		const { data, params: pathParams } = match;
		const { handler } = data;

		let body = null;
		if (method === "POST" || method === "PUT" || method === "PATCH") {
			try {
				body = await request.json();
			} catch (error) {
				// Handle JSON parsing errors
			}
		}

		try {
			const result = await handler({
				autumn,
				body,
				path: pathname,
				getCustomer: async () => await options.identify(ctx),
				pathParams,
				searchParams,
			});

			if (result.statusCode === 204) {
				return new Response(null, { status: 204 });
			}

			return json(result.body, { status: result.statusCode });
		} catch (error: any) {
			console.error("Autumn handler error:", error.message);
			return json(
				{
					message: error.message || "Internal server error",
					code: "internal_server_error",
					statusCode: 500,
				},
				{ status: 500 },
			);
		}
	};

	// Return handlers for supported HTTP methods
	return {
		GET: handleRequest,
		POST: handleRequest,
		PUT: handleRequest,
		PATCH: handleRequest,
		DELETE: handleRequest,
	};
};

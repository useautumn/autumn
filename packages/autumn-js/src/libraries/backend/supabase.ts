import { Autumn } from "@sdk";
import { findRoute } from "rou3";
import { autumnApiUrl } from "./constants";
import { createRouterWithOptions } from "./routes/backendRouter";
import type { AuthResult } from "./utils/AuthFunction";
import { secretKeyCheck } from "./utils/secretKeyCheck";

export function autumnHandler(options: {
	corsHeaders: Record<string, any>;
	identify: (request: Request) => AuthResult;
	secretKey?: string;
}) {
	// @ts-expect-error
	const secretKey = Deno.env.get("AUTUMN_SECRET_KEY");

	if (!secretKey) {
		throw new Error(
			`AUTUMN_SECRET_KEY not found. Please add it to your secrets in supabase: https://supabase.com/dashboard/project/<PROJECT_ID>/functions/secrets`,
		);
	}

	const autumn = new Autumn({
		serverURL: autumnApiUrl,
		secretKey,
	});

	const router = createRouterWithOptions();

	const { found, error: resError } = secretKeyCheck(options?.secretKey);
	return async function handler(request: Request): Promise<Response> {
		if (!found && !options.secretKey) {
			return new Response(JSON.stringify(resError!), {
				status: resError!.statusCode,
			});
		}

		const method = request.method;
		const url = new URL(request.url);
		const searchParams = Object.fromEntries(url.searchParams);
		let pathname = url.pathname;

		if (!pathname.includes("/api/autumn")) {
			return new Response(
				JSON.stringify({
					message: "Not found",
					code: "not_found",
					statusCode: 404,
				}),
				{
					status: 404,
					headers: {
						...options.corsHeaders,
						"Content-Type": "application/json",
					},
				},
			);
		}

		// Extract the part starting from "/api/autumn"
		const autumnIndex = pathname.indexOf("/api/autumn");
		pathname = pathname.substring(autumnIndex);

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
					headers: {
						...options.corsHeaders,
						"Content-Type": "application/json",
					},
				},
			);
		}

		const { data, params: pathParams } = match;
		const { handler: routeHandler } = data;

		let body = null;
		if (method === "POST" || method === "PUT" || method === "PATCH") {
			try {
				body = await request.json();
			} catch (error) {
				// Silently fail if body is not valid JSON
			}
		}

		const result = await routeHandler({
			autumn,
			body,
			path: url.pathname,
			getCustomer: async () => await options.identify(request),
			pathParams,
			searchParams,
		});

		if (result.statusCode === 204) {
			return new Response(null, {
				status: 204,
				headers: {
					...options.corsHeaders,
				},
			});
		}

		return new Response(JSON.stringify(result.body), {
			status: result.statusCode,
			headers: {
				...options.corsHeaders,
				"Content-Type": "application/json",
			},
		});
	};
}

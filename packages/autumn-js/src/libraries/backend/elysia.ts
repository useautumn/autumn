import { Autumn } from "@sdk";
import { toSnakeCase } from "@utils/toSnakeCase";
import type { Elysia } from "elysia";
import { findRoute } from "rou3";
import { autumnApiUrl } from "./constants";
import { createRouterWithOptions } from "./routes/backendRouter";
import type { AuthResult } from "./utils/AuthFunction";
import { secretKeyCheck } from "./utils/secretKeyCheck";

export function autumnHandler(options: {
	identify: (context: any) => AuthResult | Promise<AuthResult>;
	apiVersion?: string;
	secretKey?: string;
	baseURL?: string;
}) {
	const { found, error: resError } = secretKeyCheck(options.secretKey);
	if (!found && !options.secretKey) {
		throw new Error(resError?.message || "Secret key check failed");
	}

	const router = createRouterWithOptions();

	return function plugin(app: Elysia) {
		// Handle GET/DELETE requests (no body parsing)
		app.get("/api/autumn/*", async (context: any) => {
			return handleRequest(context);
		});

		app.delete("/api/autumn/*", async (context: any) => {
			return handleRequest(context);
		});

		// Handle POST/PUT/PATCH requests (with body parsing)
		app.post("/api/autumn/*", async (context: any) => {
			return handleRequest(context);
		});

		app.put("/api/autumn/*", async (context: any) => {
			return handleRequest(context);
		});

		app.patch("/api/autumn/*", async (context: any) => {
			return handleRequest(context);
		});

		async function handleRequest(context: any) {
			const { found, error: resError } = secretKeyCheck(options.secretKey);
			if (!found) {
				context.set.status = resError!.statusCode;
				return resError;
			}

			const autumn = new Autumn({
				serverURL: options.baseURL || autumnApiUrl,
				apiVersion: options.apiVersion,
				secretKey: options.secretKey,
			});

			const request = context.request;
			const url = new URL(request.url);
			const path = url.pathname;
			const searchParams = Object.fromEntries(url.searchParams);
			const method = request.method;

			const match = findRoute(router, method, path);

			if (!match) {
				context.set.status = 404;
				return {
					message: "Not found",
					code: "not_found",
					statusCode: 404,
				};
			}

			const { data, params: pathParams } = match;
			const { handler } = data;

			let body = null;
			if (["POST", "PUT", "PATCH"].includes(method)) {
				try {
					body = context.body;
				} catch (error) {
					body = null;
				}
			}

			try {
				const result = await handler({
					autumn,
					body: toSnakeCase({ obj: body }),
					path,
					getCustomer: async () => await options.identify(context),
					pathParams,
					searchParams,
				});

				context.set.status = result.statusCode;
				if (result.statusCode === 204) {
					return null;
				}
				return result.body;
			} catch (error: any) {
				context.set.status = 500;
				return {
					message: error?.message || "Internal server error",
					code: "internal_server_error",
					statusCode: 500,
				};
			}
		}

		return app;
	};
}

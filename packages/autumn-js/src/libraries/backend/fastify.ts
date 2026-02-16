import { Autumn } from "@sdk";
import { findRoute } from "rou3";
import { autumnApiUrl } from "./constants";
import { createRouterWithOptions } from "./routes/backendRouter";
import type { AuthResult } from "./utils/AuthFunction";
import { secretKeyCheck } from "./utils/secretKeyCheck";

export function autumnHandler(options: {
	identify: (request: any) => AuthResult;
	version?: string;
	secretKey?: string;
	baseURL?: string;
}) {
	const autumn = new Autumn({
		serverURL: autumnApiUrl,
		apiVersion: options.version,
	});

	const router = createRouterWithOptions();

	const { found, error: resError } = secretKeyCheck(options?.secretKey);

	return async (request: any, reply: any) => {
		try {
			if (!found && !options.secretKey) {
				return reply.code(resError!.statusCode).send(resError);
			}

			const url = new URL(request.url, `http://${request.headers.host}`);
			const path = url.pathname;

			const searchParams = Object.fromEntries(
				new URLSearchParams(request.query),
			);

			const match = findRoute(router, request.method, path);

			if (!match) {
				return reply.code(404).send({
					message: "Not found",
					code: "not_found",
					statusCode: 404,
				});
			}

			const { data, params: pathParams } = match;
			const { handler } = data;

			let body = null;
			if (["POST", "PUT", "PATCH"].includes(request.method)) {
				body = request.body;
			}

			const result = await handler({
				autumn,
				body,
				path,
				pathParams,
				searchParams,
				getCustomer: async () => {
					return await options.identify(request);
				},
			});

			if (result.statusCode === 204) {
				return reply.code(204).send();
			}

			// Send response
			return reply.code(result.statusCode).send(result.body);
		} catch (error) {
			console.error("Error handling Autumn request:", error);
			return reply.code(500).send({
				message: "Internal server error",
				code: "internal_server_error",
				statusCode: 500,
			});
		}
	};
}

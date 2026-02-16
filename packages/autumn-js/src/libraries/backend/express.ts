import { Autumn } from "@sdk";
import { findRoute } from "rou3";
import { autumnApiUrl } from "./constants";
import { createRouterWithOptions } from "./routes/backendRouter";
import type { AuthResult } from "./utils/AuthFunction";
import { secretKeyCheck } from "./utils/secretKeyCheck";

// Define middleware types
export type AutumnRequestHandler = (req: any, res: any, next: any) => void;

export type AutumnHandlerOptions = {
	identify: (req: any, res: any) => AuthResult;
	version?: string;
	secretKey?: string;
	baseURL?: string;
	autumn?: (req: any) => Autumn | Autumn;
};

export const autumnHandler = (
	options?: AutumnHandlerOptions,
): AutumnRequestHandler => {
	const router = createRouterWithOptions();

	const { found, error: resError } = secretKeyCheck(options?.secretKey);

	return async (req: any, res: any, next: any) => {
		if (!found && !options?.secretKey) {
			return res.status(resError!.statusCode).json(resError);
		}

		const autumn =
			typeof options?.autumn === "function"
				? options.autumn(req)
				: options?.autumn ||
					new Autumn({
						serverURL: options?.baseURL || autumnApiUrl,
						apiVersion: options?.version,
					});

		let path = req.path;
		const searchParams = Object.fromEntries(new URLSearchParams(req.query));

		if (!path.startsWith("/api/autumn")) {
			path = "/api/autumn" + path;
		}

		const match = findRoute(router, req.method, path);

		if (match) {
			const { data, params: pathParams } = match;
			const { handler } = data;

			let body = null;
			if (req.method === "POST") {
				try {
					body = req.body;
				} catch (error) {}
			}

			try {
				const result = await handler({
					autumn,
					body,
					path: req.path,
					getCustomer: async () => {
						return await options?.identify(req, res);
					},
					pathParams,
					searchParams,
				});

				if (result.statusCode === 204) {
					return res.status(204).end();
				}

				return res.status(result.statusCode).json(result.body);
			} catch (error) {
				console.error("Error handling Autumn request:", error);
				return res.status(500).json({
					message: "Internal server error",
					code: "internal_server_error",
					statusCode: 500,
				});
			}
		}

		next();
	};
};

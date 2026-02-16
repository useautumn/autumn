import { Autumn } from "@useautumn/sdk";
import { NextResponse } from "next/server";
import { findRoute } from "rou3";
import { autumnApiUrl } from "./constants";
import { createRouterWithOptions } from "./routes/backendRouter";
import type { AuthResult } from "./utils/AuthFunction";
import { secretKeyCheck } from "./utils/secretKeyCheck";

export function autumnHandler(options: {
	identify: (request: any) => AuthResult;
	baseURL?: string;
	secretKey?: string;
}) {
	const router = createRouterWithOptions();

	async function handler(request: any, response?: any) {
		const { found, error: resError } = secretKeyCheck(options.secretKey);

		// Check if this is pages router by looking for NextApiRequest properties
		const isPagesRouter =
			response && "query" in request && "cookies" in request;

		if (!found) {
			if (isPagesRouter) {
				return response.status(resError!.statusCode).json(resError);
			} else {
				return NextResponse.json(resError, { status: resError!.statusCode });
			}
		}

		const autumn = new Autumn({
			secretKey: options.secretKey || undefined,
			serverURL: options.baseURL || autumnApiUrl,
		});

		if (!found) {
			if (isPagesRouter) {
				return response.status(500).json(resError);
			} else {
				return NextResponse.json(resError, { status: 500 });
			}
		}

		const method = request.method;

		// Handle both app router (full URL) and pages router (pathname only)
		let url: URL;
		if (!request.url.includes("http")) {
			// Pages router
			url = new URL(request.url, "http://localhost:3000");
		} else {
			url = new URL(request.url);
		}

		const searchParams = Object.fromEntries(url.searchParams);
		const pathname = url.pathname;

		const match = findRoute(router, method, pathname);

		if (!match) {
			const notFoundBody = {
				message: "Not found",
				code: "not_found",
				statusCode: 404,
			};
			if (isPagesRouter) {
				return response.status(404).json(notFoundBody);
			} else {
				return NextResponse.json(notFoundBody, { status: 404 });
			}
		}

		const { data, params: pathParams } = match;
		const { handler } = data;

		let body = null;
		if (method === "POST" || method === "PUT" || method === "PATCH") {
			try {
				body = await request.json();
			} catch (error) {}
		}

		const result = await handler({
			autumn,
			body,
			path: url.pathname,
			getCustomer: async () => await options.identify(request),
			pathParams,
			searchParams,
		});

		if (isPagesRouter) {
			if (result.statusCode === 204) {
				return response.status(204).end();
			}
			return response.status(result.statusCode).json(result.body);
		} else {
			if (result.statusCode === 204) {
				return new Response(null, { status: 204 });
			}
			return NextResponse.json(result.body, { status: result.statusCode });
		}
	}

	return {
		GET: handler,
		POST: handler,
	};
}

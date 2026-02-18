import { NextResponse } from "next/server";
import { type AuthResult, createCoreHandler } from "../core";

export type NextAutumnHandlerOptions = {
	/** Function to identify the customer from the request */
	identify: (request: Request) => AuthResult;
	/** Autumn API secret key */
	secretKey?: string;
	/** Autumn API URL */
	autumnURL?: string;
	/** Path prefix for routes (default: "/api/autumn") */
	pathPrefix?: string;
};

export function autumnHandler(options: NextAutumnHandlerOptions) {
	const core = createCoreHandler({
		identify: (raw) => options.identify(raw as Request),
		secretKey: options.secretKey,
		autumnURL: options.autumnURL,
		pathPrefix: options.pathPrefix,
	});

	const handle = async (request: Request) => {
		const url = new URL(request.url);

		let body: unknown = null;
		if (request.method !== "GET") {
			try {
				body = await request.json();
			} catch {
				body = null;
			}
		}

		const result = await core({
			method: request.method,
			path: url.pathname,
			body,
			raw: request,
		});

		// 204 No Content - return empty response
		if (result.status === 204) {
			return new NextResponse(null, { status: 204 });
		}

		// Return body directly with actual HTTP status
		return NextResponse.json(result.body, { status: result.status });
	};

	return {
		GET: handle,
		POST: handle,
		DELETE: handle,
	};
}

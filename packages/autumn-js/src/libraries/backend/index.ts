import { Autumn } from "@sdk";
import { findRoute } from "rou3";
import { createRouterWithOptions } from "./routes/backendRouter";
import { secretKeyCheck } from "./utils/secretKeyCheck";

// Re-export Autumn type to ensure users import from the same module path
export { Autumn };

export async function autumnHandler(options: {
	request: {
		url: string;
		method: string;
		body: any;
	};

	// Customer data...
	customerId?: string;
	customerData?: {
		name?: string;
		email?: string;
	};

	clientOptions?: {
		secretKey?: string;
		baseURL?: string;
	};
}) {
	const router = createRouterWithOptions();

	const { found, error: resError } = secretKeyCheck(
		options?.clientOptions?.secretKey,
	);

	if (!found) {
		return {
			statusCode: 500,
			response: resError,
		};
	}

	const autumn = new Autumn({
		secretKey: options.clientOptions?.secretKey,
		serverURL: options.clientOptions?.baseURL,
	});

	const { method, url: requestUrl, body } = options.request;

	let url: URL;
	if (!requestUrl.includes("http")) {
		url = new URL(requestUrl, "http://localhost:3000");
	} else {
		url = new URL(requestUrl);
	}
	const match = findRoute(router, method, url.pathname);
	const searchParams = Object.fromEntries(url.searchParams);

	if (!match) {
		return {
			statusCode: 404,
			response: {
				message: "Not found",
				code: "not_found",
				statusCode: 404,
			},
		};
	}

	const { data, params: pathParams } = match;
	const { handler } = data;

	const result = await handler({
		autumn,
		body,
		path: url.pathname,
		getCustomer: async () => {
			return {
				customerId: options.customerId,
				customerData: options.customerData,
			};
		},
		pathParams,
		searchParams,
	});

	return {
		statusCode: result.statusCode,
		response: result.statusCode === 204 ? null : result.body,
	};
}

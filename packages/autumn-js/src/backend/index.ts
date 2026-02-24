import {
	type CustomerData,
	createCoreHandler,
	type RouteDefinition,
} from "./core";

// ─────────────────────────────────────────────────────────────
// General Handler (framework-agnostic)
// ─────────────────────────────────────────────────────────────

export type AutumnHandlerOptions = {
	request: {
		url: string;
		method: string;
		body: unknown;
	};
	customerId?: string;
	customerData?: CustomerData;
	clientOptions?: {
		secretKey?: string;
		baseURL?: string;
	};
	pathPrefix?: string;
	routes?: RouteDefinition[];
};

export type AutumnHandlerResult = {
	statusCode: number;
	response: unknown;
};

export async function autumnHandler(
	options: AutumnHandlerOptions,
): Promise<AutumnHandlerResult> {
	const {
		request,
		customerId,
		customerData,
		clientOptions,
		pathPrefix,
		routes,
	} = options;

	const handler = createCoreHandler({
		identify: async () => ({
			customerId: customerId ?? null,
			customerData,
		}),
		secretKey: clientOptions?.secretKey,
		autumnURL: clientOptions?.baseURL,
		pathPrefix,
		routes,
	});

	// Parse URL
	let url: URL;
	if (!request.url.includes("http")) {
		url = new URL(request.url, "http://localhost:3000");
	} else {
		url = new URL(request.url);
	}

	const result = await handler({
		method: request.method,
		path: url.pathname,
		body: request.body,
		raw: request,
	});

	return {
		statusCode: result.status,
		response: result.status === 204 ? null : result.body,
	};
}

// ─────────────────────────────────────────────────────────────
// Core exports
// ─────────────────────────────────────────────────────────────

export {
	type AuthResult,
	type BackendErrorBody,
	type BackendResult,
	backendError,
	backendSuccess,
	buildRouter,
	type CoreHandlerOptions,
	type CustomerData,
	// Types
	type CustomerId,
	type CustomHandlerArgs,
	type CustomHandlerFn,
	// Handler
	createCoreHandler,
	isBackendResult,
	type ResolvedIdentity,
	type RouteDefinition,
	// Route helpers
	routeConfigs,
	// Utils
	sanitizeBody,
	secretKeyCheck,
	type UnifiedRequest,
	type UnifiedResponse,
} from "./core";

export { createCoreHandler, handleRouteByName } from "./handlers";
export type {
	HandleRouteByNameOptions,
	HandleRouteByNameResult,
} from "./handlers/handleRouteByName";

export { buildRouter, routeConfigs } from "./routes";
export type {
	AuthResult,
	BackendErrorBody,
	BackendResult,
	CoreHandlerOptions,
	CustomerData,
	CustomerId,
	CustomHandlerArgs,
	CustomHandlerFn,
	ResolvedIdentity,
	RouteDefinition,
	UnifiedRequest,
	UnifiedResponse,
} from "./types";

export {
	backendError,
	backendSuccess,
	isBackendResult,
	sanitizeBody,
	secretKeyCheck,
} from "./utils";

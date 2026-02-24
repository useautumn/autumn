import type { AuthResult } from "./authTypes";
import type { RouteDefinition } from "./routeTypes";

/** Unified request format for all framework adapters */
export type UnifiedRequest = {
	method: string;
	path: string;
	body: unknown;
	raw: unknown;
};

/** Unified response format returned by core handler */
export type UnifiedResponse = {
	status: number;
	body: unknown;
};

/** Options for creating the core handler */
export type CoreHandlerOptions = {
	/** Function to identify the customer from the request */
	identify: (raw: unknown) => AuthResult;
	/** Autumn API secret key */
	secretKey?: string;
	/** Autumn API URL (default: https://api.useautumn.com/v1) */
	autumnURL?: string;
	/** Path prefix for routes (default: "/api/autumn") */
	pathPrefix?: string;
	/** Custom routes to use instead of defaults */
	routes?: RouteDefinition[];
};

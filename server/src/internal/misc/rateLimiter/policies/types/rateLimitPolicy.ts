import type { RateLimitLayer } from "./rateLimitLayer";
import type { RateLimitRequestCtx } from "./rateLimitRequestCtx";
import type { RateLimitRoute } from "./rateLimitRoute";

export type RateLimitPolicy = {
	id: string;
	routes: RateLimitRoute[] | "*";
	/** Narrows a row to some requests on its routes; resolving without a ctx skips the row. */
	appliesTo?: (params: { ctx: RateLimitRequestCtx }) => boolean;
	perOrg?: RateLimitLayer;
	perCustomer?: RateLimitLayer;
	skipForTestsOrg?: boolean;
};

import type { RateLimitLayer } from "./rateLimitLayer";
import type { RateLimitRoute } from "./rateLimitRoute";

export type RateLimitPolicy = {
	id: string;
	routes: RateLimitRoute[] | "*";
	perOrg?: RateLimitLayer;
	perCustomer?: RateLimitLayer;
	skipForTestsOrg?: boolean;
};

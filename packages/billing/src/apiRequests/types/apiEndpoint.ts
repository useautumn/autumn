import type { ApiRoute } from "./apiRoute";
import type { RequestWeight } from "./requestWeight";

/** Resource an endpoint belongs to; deals can price a whole group. */
export type ApiEndpointGroup = "customers" | "entities" | "balances";

/**
 * One billable endpoint: every route that means the same operation, and how a
 * call to it converts into requests. `id` is the rate-card dimension.
 */
export type ApiEndpoint<Id extends string = string> = {
	id: Id;
	group: ApiEndpointGroup;
	routes: ApiRoute[];
	weight: RequestWeight;
};

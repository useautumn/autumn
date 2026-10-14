import type { ApiRoute } from "./apiRoute";
import type { RequestWeight } from "./requestWeight";

export type ApiEndpointGroup = "customers" | "entities" | "balances";

export type ApiEndpoint<Id extends string = string> = {
	id: Id;
	group: ApiEndpointGroup;
	routes: ApiRoute[];
	weight: RequestWeight;
};

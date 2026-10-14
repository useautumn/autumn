import type { ApiEndpoint, ApiEndpointGroup } from "./types/apiEndpoint";
import type { ApiRoute } from "./types/apiRoute";
import type { RequestWeight } from "./types/requestWeight";

export const apiRequestEventProperties = {
	endpointId: "endpoint_id",
} as const;

type Path = ApiRoute["path"];

export const get = (path: Path): ApiRoute => ({ method: "GET", path });
export const post = (path: Path): ApiRoute => ({ method: "POST", path });
export const patch = (path: Path): ApiRoute => ({ method: "PATCH", path });
export const del = (path: Path): ApiRoute => ({ method: "DELETE", path });

export const apiEndpoint = <Id extends `${ApiEndpointGroup}.${string}`>({
	id,
	routes,
	weight = "one_per_call",
}: {
	id: Id;
	routes: ApiRoute[];
	weight?: RequestWeight;
}): ApiEndpoint<Id> => ({
	id,
	group: id.split(".")[0] as ApiEndpointGroup,
	routes,
	weight,
});

export const apiRequestCatalog = [
	apiEndpoint({
		id: "customers.get_or_create",
		routes: [post("/v1/customers"), post("/v1/customers.get_or_create")],
	}),
	apiEndpoint({
		id: "customers.get",
		routes: [get("/v1/customers/{customer_id}"), post("/v1/customers.get")],
	}),

	apiEndpoint({
		id: "entities.create",
		routes: [
			post("/v1/customers/{customer_id}/entities"),
			post("/v1/entities.create"),
		],
	}),

	apiEndpoint({
		id: "entities.get",
		routes: [
			get("/v1/customers/{customer_id}/entities/{entity_id}"),
			post("/v1/entities.get"),
		],
	}),

	apiEndpoint({
		id: "balances.check",
		routes: [
			post("/v1/check"),
			post("/v1/entitled"),
			post("/v1/balances.check"),
		],
	}),

	apiEndpoint({
		id: "balances.track",
		routes: [
			post("/v1/track"),
			post("/v1/events"),
			post("/v1/track_tokens"),

			post("/v1/balances.track"),
			post("/v1/balances.track_tokens"),
		],
	}),

	apiEndpoint({
		id: "balances.batch_track",
		routes: [
			post("/v1/balances.batch_track"),
			post("/v1/balances.batch_track_tokens"),
		],
		weight: "one_per_item",
	}),
	apiEndpoint({
		id: "balances.update",
		routes: [
			post("/v1/usage"),
			post("/v1/balances/update"),
			post("/v1/balances.update"),
		],
	}),
	apiEndpoint({
		id: "balances.batch_update",
		routes: [post("/v1/balances.batch_update")],
		weight: "one_per_item",
	}),
];

export type ApiEndpointId = (typeof apiRequestCatalog)[number]["id"];

import { matchRoute } from "./middlewareUtils.js";

export type RefreshCacheRouteConfig = {
	method: string;
	url: string;
};

const route = ({
	method,
	url,
}: RefreshCacheRouteConfig): RefreshCacheRouteConfig => ({
	method,
	url,
});

export const REFRESH_CACHE_ROUTE_CONFIGS: RefreshCacheRouteConfig[] = [
	// MAIN ROUTES
	route({
		method: "DELETE",
		url: "/customers/:customer_id",
	}),

	route({
		method: "POST",
		url: "/customers/:customer_id",
	}),

	route({
		method: "PATCH",
		url: "/customers/:customer_id",
	}),

	route({
		method: "POST",
		url: "/customers/:customer_id/balances",
	}),

	route({
		method: "POST",
		url: "/customers/:customer_id/entitlements/:customer_entitlement_id",
	}),

	route({
		method: "POST",
		url: "/customers/:customer_id/entities",
	}),

	route({
		method: "DELETE",
		url: "/customers/:customer_id/entities/:entity_id",
	}),

	route({
		method: "POST",
		url: "/customers/:customer_id/transfer",
	}),

	route({
		method: "POST",
		url: "/attach",
	}),

	route({
		method: "POST",
		url: "/cancel",
	}),

	route({
		method: "POST",
		url: "/subscriptions/update",
	}),

	route({
		method: "POST",
		url: "/billing/attach",
	}),

	route({
		method: "POST",
		url: "/balances/create",
	}),

	// RPC ROUTES
	route({
		method: "POST",
		url: "/billing.attach",
	}),

	route({
		method: "POST",
		url: "/billing.update",
	}),

	route({
		method: "POST",
		url: "/billing.setup_payment",
	}),

	route({
		method: "POST",
		url: "/billing.multi_attach",
	}),

	route({
		method: "POST",
		url: "/balances.create",
	}),

	route({
		method: "POST",
		url: "/balances.delete",
	}),

	route({
		method: "POST",
		url: "/entities.create",
	}),

	route({
		method: "POST",
		url: "/entities.delete",
	}),

	route({
		method: "POST",
		url: "/entities.update",
	}),

	route({
		method: "POST",
		url: "/customers.update",
	}),

	route({
		method: "POST",
		url: "/customers.delete",
	}),
];

export const getRefreshCacheRouteConfig = ({
	method,
	path,
}: {
	method: string;
	path: string;
}) =>
	REFRESH_CACHE_ROUTE_CONFIGS.find((pattern) =>
		matchRoute({
			url: path,
			method,
			pattern,
		}),
	);

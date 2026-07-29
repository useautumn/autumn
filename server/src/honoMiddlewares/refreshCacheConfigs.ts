import { matchRoute } from "./middlewareUtils.js";

export type RefreshCacheRouteConfig = {
	method: string;
	url: string;
	/** Flush cached balances to Postgres before invalidating. Only safe on
	 *  balance-neutral routes — everywhere else Postgres was just written
	 *  directly and the cached balances are stale. */
	flushBalances?: boolean;
};

const route = ({
	method,
	url,
	flushBalances,
}: RefreshCacheRouteConfig): RefreshCacheRouteConfig => ({
	method,
	url,
	flushBalances,
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
		flushBalances: true,
	}),
	route({
		method: "PATCH",
		url: "/customers/:customer_id",
		flushBalances: true,
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

	route({
		method: "POST",
		url: "/balances/update",
		flushBalances: true,
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
		flushBalances: true,
	}),

	route({
		method: "POST",
		url: "/billing.multi_attach",
	}),

	route({
		method: "POST",
		url: "/billing.create_schedule",
	}),

	route({
		method: "POST",
		url: "/billing.open_customer_portal",
		flushBalances: true,
	}),

	route({
		method: "POST",
		url: "/balances.create",
	}),

	route({
		method: "POST",
		url: "/balances.update",
		flushBalances: true,
	}),

	route({
		method: "POST",
		url: "/rewards.redeem",
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
		url: "/customers.delete",
	}),

	route({
		method: "POST",
		url: "/customers.update",
		flushBalances: true,
	}),

	route({
		method: "POST",
		url: "/licenses.attach",
	}),

	route({
		method: "POST",
		url: "/licenses.release",
	}),

	route({
		method: "POST",
		url: "/billing.import",
	}),

	route({
		method: "POST",
		url: "/billing.sync",
	}),

	route({
		method: "POST",
		url: "/billing.sync_v2",
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

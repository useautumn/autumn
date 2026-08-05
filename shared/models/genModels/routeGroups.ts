/** Coarse grouping of API routes, declared per route via createRoute.
 *  Used for per-group org configuration (idempotency TTLs today). */
export enum RouteGroup {
	Balances = "balances",
}

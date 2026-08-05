import {
	DEFAULT_IDEMPOTENCY_TTL_HOURS,
	ms,
	type RouteGroup,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";

/** The org's configured idempotency TTL for a route group (hours → ms),
 *  falling back to the 24h default. The config rides on the org row, so
 *  this is a pure read of ctx — no fetch, no cache. */
export const resolveIdempotencyTtlMs = ({
	ctx,
	routeGroup,
}: {
	ctx: AutumnContext;
	routeGroup: RouteGroup | null;
}): number => {
	const entry = routeGroup
		? ctx.org.idempotency_config?.find(
				(candidate) => candidate.routeGroup === routeGroup,
			)
		: undefined;

	return ms.hours(entry?.idempotencyTtl ?? DEFAULT_IDEMPOTENCY_TTL_HOURS);
};

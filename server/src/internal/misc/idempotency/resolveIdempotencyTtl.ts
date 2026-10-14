import {
	DEFAULT_IDEMPOTENCY_TTL_HOURS,
	ms,
	type RouteGroup,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";

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

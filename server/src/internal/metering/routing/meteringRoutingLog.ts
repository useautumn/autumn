import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import type { MeteringRoutingMode } from "@/internal/misc/meteringRouting/meteringRoutingSchemas.js";

export type MeteringRoutingRoute = "check" | "track";

export type MeteringRoutingOutcome = "routed" | "fallback";

/** Why the request ended where it did. `worker_*` reasons are the interesting
 *  ones — they are the signal that a mode should be rolled back. */
export type MeteringRoutingReason =
	| "worker_ok"
	| "worker_unreachable"
	/** The request shape has no worker equivalent (e.g. a track that fans out
	 *  across several features, which /track cannot express). */
	| "unsupported_shape";

/**
 * One structured line per routing decision, on both the routed and the
 * fallback branch, so a mode ramp can be read straight off the logs without
 * inferring anything from absence. Fallbacks warn because they are the thing
 * worth alerting on; a clean route is informational.
 */
export const logMeteringRoutingDecision = ({
	ctx,
	route,
	mode,
	customerId,
	outcome,
	reason,
	error,
}: {
	ctx: AutumnContext;
	route: MeteringRoutingRoute;
	mode: MeteringRoutingMode;
	customerId?: string;
	outcome: MeteringRoutingOutcome;
	reason: MeteringRoutingReason;
	error?: unknown;
}): void => {
	const fields = {
		type: "metering_routing_decision",
		route,
		mode,
		outcome,
		reason,
		org_id: ctx.org.id,
		env: ctx.env,
		customer_id: customerId ?? null,
		...(error === undefined ? {} : { error }),
	};

	const message = `[metering-routing] ${route} ${outcome} (${reason})`;
	if (outcome === "fallback") {
		ctx.logger.warn(message, fields);
		return;
	}
	ctx.logger.info(message, fields);
};

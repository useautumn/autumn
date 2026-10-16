import type { Context } from "hono";
import { atomReadyAt, readAtomHealth } from "../../init/atomHealth.js";
import { PEER_PROBE_USER_AGENT } from "../../replicas/membership/readyBootOf.js";
import type { AtomHttpContext } from "../types/atomHttp.js";

/** The target group checks /health every 30 s and needs 2 passes; this outlasts them with a margin, so the deployment's
 *  rollout, which keys on its own probe, retires the next replica only once the load balancer routes to this one. */
export const LOAD_BALANCER_SETTLE_MS = 75_000;
const LOAD_BALANCER_CHECKER_PREFIX = "ELB-HealthChecker/";

export const receiveHealth = ({ ctx }: { ctx: AtomHttpContext }) =>
	function receive(context: Context) {
		const health = readAtomHealth(ctx.health);
		// Starting is a 503: the deployment's rollout waits on it before it retires the replica being replaced. Degraded
		// still serves from every other thread, so the load balancer keeps sending to it.
		if (health.status === "starting") return context.json(health, 503);
		const settlingUntil = settlingUntilOf({ ctx });
		if (settlingUntil === null || isExemptProber(context))
			return context.json(health, 200);
		return context.json({ ...health, settlingUntil }, 503);
	};

/** ISO instant the settle ends at, or null once it has; the load balancer and the peers are not held by it. */
const settlingUntilOf = ({ ctx }: { ctx: AtomHttpContext }): string | null => {
	const readyAt = atomReadyAt(ctx.health);
	if (readyAt === null) return null;
	const until = readyAt + LOAD_BALANCER_SETTLE_MS;
	return (ctx.now ?? Date.now)() < until ? new Date(until).toISOString() : null;
};

const isExemptProber = (context: Context): boolean => {
	const userAgent = context.req.header("user-agent") ?? "";
	return (
		userAgent.startsWith(LOAD_BALANCER_CHECKER_PREFIX) ||
		userAgent === PEER_PROBE_USER_AGENT
	);
};

import type { Context } from "hono";
import { readAtomHealth } from "../../init/atomHealth.js";
import type { AtomHttpContext } from "../types/atomHttp.js";

export const receiveHealth = ({ ctx }: { ctx: AtomHttpContext }) =>
	function receive(context: Context) {
		const health = readAtomHealth(ctx.health);
		// Starting is a 503: the deployment's rollout waits on it before it retires the replica being replaced. Degraded
		// still serves from every other thread, so the load balancer keeps sending to it.
		return context.json(health, health.status === "starting" ? 503 : 200);
	};

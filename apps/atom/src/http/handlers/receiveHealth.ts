import type { Context } from "hono";
import { readAtomHealth } from "../../init/atomHealth.js";
import type { AtomHttpContext } from "../types/atomHttp.js";

export const receiveHealth = ({ ctx }: { ctx: AtomHttpContext }) =>
	function receive(context: Context) {
		const health = readAtomHealth(ctx.health);
		return context.json(health, health.status === "starting" ? 503 : 200);
	};

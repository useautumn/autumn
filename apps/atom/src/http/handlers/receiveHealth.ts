import type { Context } from "hono";
import { readAtomHealth } from "../../init/atomHealth.js";
import { probePeers } from "../../peers/probePeers.js";
import type { AtomHttpContext } from "../types/atomHttp.js";

export const receiveHealth = ({ ctx }: { ctx: AtomHttpContext }) =>
	async function receive(context: Context) {
		const health = readAtomHealth(ctx.health);
		// Spike diagnostics: `?peers=1` adds this replica's addresses and what atom.svc resolves to.
		if (context.req.query("peers") !== "1") return context.json(health);
		return context.json({ ...health, replica: await probePeers() });
	};

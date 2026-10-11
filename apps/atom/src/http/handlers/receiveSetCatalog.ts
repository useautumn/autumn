import type { Context } from "hono";
import { applyCatalogPush } from "../../pushes/applyPushes.js";
import type { AtomHttpContext, AtomHttpEnv } from "../types/atomHttp.js";

export const receiveSetCatalog = ({ ctx }: { ctx: AtomHttpContext }) =>
	async function receive(context: Context<AtomHttpEnv>) {
		const stored = await applyCatalogPush({
			slots: context.get("slots"),
			body: context.get("body"),
			text: await context.req.text(),
			peers: context.get("relayed") ? undefined : ctx.peerRelay,
		});
		return context.json({ stored });
	};

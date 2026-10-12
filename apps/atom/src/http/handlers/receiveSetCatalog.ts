import type { Context } from "hono";
import { applyCatalogPush } from "../../pushes/applyPushes.js";
import type { AtomHttpContext, AtomHttpEnv } from "../types/atomHttp.js";

export const receiveSetCatalog = ({
	ctx,
}: {
	ctx: Pick<AtomHttpContext, "replication">;
}) =>
	async function receive(context: Context<AtomHttpEnv>) {
		const stored = await applyCatalogPush({
			slots: context.get("slots"),
			body: await context.req.text(),
			replication: ctx.replication,
			relayed: context.get("relayed"),
		});
		return context.json({ stored });
	};

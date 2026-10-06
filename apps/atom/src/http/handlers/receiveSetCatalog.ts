import type { Context } from "hono";
import { applyCatalogPush } from "../../pushes/applyPushes.js";
import type { AtomHttpEnv } from "../types/atomHttp.js";

export async function receiveSetCatalog(context: Context<AtomHttpEnv>) {
	const stored = await applyCatalogPush({
		slots: context.get("slots"),
		body: context.get("body"),
	});
	return context.json({ stored });
}

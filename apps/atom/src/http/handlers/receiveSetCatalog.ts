import type { Context } from "hono";
import { catalogBodyToSharedRows } from "../../lib/contracts/catalogContract.js";
import type { AtomHttpEnv } from "../types/atomHttp.js";

export async function receiveSetCatalog(context: Context<AtomHttpEnv>) {
	const sharedRows = catalogBodyToSharedRows({
		body: await context.req.json(),
	});
	const stored = context.get("slots").setCatalog(sharedRows);
	return context.json({ stored });
}

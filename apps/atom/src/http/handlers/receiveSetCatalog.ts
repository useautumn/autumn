import type { Context } from "hono";
import { catalogBodyToSharedRows } from "../../lib/contracts/catalogContract.js";
import type { AtomHttpEnv } from "../types/atomHttp.js";

export function receiveSetCatalog(context: Context<AtomHttpEnv>) {
	const sharedRows = catalogBodyToSharedRows({ body: context.get("body") });
	const stored = context.get("slots").setCatalog(sharedRows);
	return context.json({ stored });
}

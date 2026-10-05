import type { Context } from "hono";
import { createAtomHealthReader } from "../../init/atomHealth.js";

const readAtomHealth = createAtomHealthReader();

export function receiveHealth(context: Context) {
	return context.json(readAtomHealth());
}

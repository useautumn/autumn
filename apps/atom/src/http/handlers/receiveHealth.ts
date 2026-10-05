import type { Context } from "hono";
import { createAtomHealthReader } from "../../init/atomHealth.js";
import { createContainerStatsReader } from "../../init/containerStats.js";

const readAtomHealth = createAtomHealthReader();
const readContainerStats = createContainerStatsReader();

export function receiveHealth(context: Context) {
	return context.json({ ...readAtomHealth(), container: readContainerStats() });
}

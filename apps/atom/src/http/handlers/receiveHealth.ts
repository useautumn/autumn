import type { Context } from "hono";
import { createAtomHealthReader } from "../../init/atomHealth.js";
import { createContainerStatsReader } from "../../init/containerStats.js";
import { createProcessStatsReader } from "../../init/processStats.js";

const readAtomHealth = createAtomHealthReader();
const readContainerStats = createContainerStatsReader();
const readProcessStats = createProcessStatsReader();

export function receiveHealth(context: Context) {
	return context.json({
		...readAtomHealth(),
		container: readContainerStats(),
		processTimings: readProcessStats(),
	});
}

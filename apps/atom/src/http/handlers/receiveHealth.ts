import type { Context } from "hono";
import { readAtomHealth } from "../../init/atomHealth.js";
import { createContainerStatsReader } from "../../init/containerStats.js";
import { createProcessStatsReader } from "../../init/processStats.js";
import type { AtomHttpContext } from "../types/atomHttp.js";

const readContainerStats = createContainerStatsReader();
const readProcessStats = createProcessStatsReader();

export const receiveHealth = ({ ctx }: { ctx: AtomHttpContext }) =>
	function receive(context: Context) {
		return context.json({
			...readAtomHealth(ctx.health),
			container: readContainerStats(),
			processTimings: readProcessStats(),
		});
	};

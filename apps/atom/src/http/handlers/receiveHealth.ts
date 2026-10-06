import type { Context } from "hono";
import { readAtomHealth } from "../../init/atomHealth.js";
import {
	type ContainerStats,
	createContainerStatsReader,
} from "../../init/containerStats.js";
import {
	createProcessStatsReader,
	type ProcessStats,
} from "../../init/processStats.js";
import type { AtomHttpContext } from "../types/atomHttp.js";

const readContainerStats = createContainerStatsReader();
const readProcessStats = createProcessStatsReader();

/** Cores the container used beyond its serving threads' own: GC and JIT helper threads, and the main thread. */
const gcHelperCoresOf = ({
	container,
	processTimings,
}: {
	container: ContainerStats;
	processTimings: ProcessStats[];
}): number | null => {
	if (container.cpuCores === null) return null;
	const threadCores = processTimings.reduce(
		(cores, stats) => cores + stats.cpuCores,
		0,
	);
	return Math.round((container.cpuCores - threadCores) * 100) / 100;
};

export const receiveHealth = ({ ctx }: { ctx: AtomHttpContext }) =>
	function receive(context: Context) {
		const container = readContainerStats();
		const processTimings = readProcessStats();
		return context.json({
			...readAtomHealth(ctx.health),
			container,
			gcHelperCores: gcHelperCoresOf({ container, processTimings }),
			processTimings,
		});
	};

import { logger } from "@/external/logtail/logtailUtils.js";
import { createRedisPoolMonitor } from "./createRedisPoolMonitor.js";

let monitor: ReturnType<typeof createRedisPoolMonitor> | undefined;

export const getRedisPoolMonitor = () => {
	monitor ??= createRedisPoolMonitor({ ctx: { logger } });
	return monitor;
};

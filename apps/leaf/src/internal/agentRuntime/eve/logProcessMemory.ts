import { readFile } from "node:fs/promises";
import { ms } from "@autumn/shared";
import { logger } from "../../../lib/logger.js";

const MEMORY_LOG_INTERVAL_MS = ms.minutes(1);
const BYTES_PER_MB = 1024 * 1024;

const toMb = (bytes: number) => Math.round(bytes / BYTES_PER_MB);

/** VmRSS of another process; undefined once it has exited or off Linux. */
const readRssMb = async (pid: number) => {
	try {
		const status = await readFile(`/proc/${pid}/status`, "utf8");
		const kb = status.match(/^VmRSS:\s+(\d+)/m)?.[1];
		return kb === undefined ? undefined : Math.round(Number(kb) / 1024);
	} catch {
		return undefined;
	}
};

/** The task's memory metric sums leaf and eve, so each is logged on its own
 * to show which process grows. */
export const logProcessMemory = ({ evePid }: { evePid: number }) => {
	const timer = setInterval(async () => {
		const { heapUsed, rss } = process.memoryUsage();
		logger.info("Process memory", {
			event: "leaf.process_memory",
			data: {
				eve_rss_mb: await readRssMb(evePid),
				leaf_heap_used_mb: toMb(heapUsed),
				leaf_rss_mb: toMb(rss),
			},
		});
	}, MEMORY_LOG_INTERVAL_MS);
	timer.unref();
};

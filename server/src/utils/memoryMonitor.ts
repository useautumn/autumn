/**
 * Periodic memory usage logger for diagnosing memory leaks.
 *
 * Logs heap usage, RSS, external memory, and array buffers every interval.
 * Ships to Axiom via the standard logger with type: "memory_log".
 */

import { logger } from "@/external/logtail/logtailUtils.js";

const DEFAULT_INTERVAL_MS = 60_000; // 1 minute

let previousRss = 0;
let intervalHandle: ReturnType<typeof setInterval> | null = null;

function toMB(bytes: number): number {
	return Math.round((bytes / 1024 / 1024) * 10) / 10;
}

function logMemoryUsage(label: string) {
	const mem = process.memoryUsage();

	logger.info("memory log", {
		type: "memory_log",
		label,
		pid: process.pid,
		rss_mb: toMB(mem.rss),
		heap_used_mb: toMB(mem.heapUsed),
		heap_total_mb: toMB(mem.heapTotal),
		external_mb: toMB(mem.external),
		array_buffers_mb: toMB(mem.arrayBuffers),
		rss_delta_mb: previousRss ? toMB(mem.rss - previousRss) : 0,
	});

	previousRss = mem.rss;
}

/**
 * Start periodic memory logging.
 * @param label - identifier for the process (e.g. "server", "worker")
 * @param intervalMs - how often to log (default: 60s)
 */
export function startMemoryMonitor(
	label: string,
	intervalMs = DEFAULT_INTERVAL_MS,
) {
	// Log immediately on start
	logMemoryUsage(label);

	intervalHandle = setInterval(() => {
		logMemoryUsage(label);
	}, intervalMs);

	// Don't prevent process exit
	if (intervalHandle.unref) {
		intervalHandle.unref();
	}
}

export function stopMemoryMonitor() {
	if (intervalHandle) {
		clearInterval(intervalHandle);
		intervalHandle = null;
	}
}

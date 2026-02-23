/**
 * Periodic memory usage logger for diagnosing memory leaks.
 *
 * Logs heap usage, RSS, external memory, and array buffers every interval.
 * Uses Axiom logger so metrics are queryable via type: "memory_log".
 */

import { logger } from "../external/logtail/logtailUtils.js";

const DEFAULT_INTERVAL_MS = 60_000; // 1 minute

let intervalHandle: ReturnType<typeof setInterval> | null = null;

function toMB(bytes: number): number {
	return Math.round((bytes / 1024 / 1024) * 10) / 10;
}

function logMemoryUsage(label: string) {
	const mem = process.memoryUsage();

	logger.info("memory_log", {
		type: "memory_log",
		label,
		pid: process.pid,
		rssMB: toMB(mem.rss),
		heapUsedMB: toMB(mem.heapUsed),
		heapTotalMB: toMB(mem.heapTotal),
		externalMB: toMB(mem.external),
		arrayBuffersMB: toMB(mem.arrayBuffers),
	});
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

	console.log(
		`[mem:${label}] Memory monitor started (every ${intervalMs / 1000}s)`,
	);
}

export function stopMemoryMonitor() {
	if (intervalHandle) {
		clearInterval(intervalHandle);
		intervalHandle = null;
	}
}

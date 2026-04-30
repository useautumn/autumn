/**
 * Periodic memory usage logger for diagnosing memory leaks.
 *
 * Logs heap usage, RSS, external memory, array buffers, and event loop lag every interval.
 * Uses Axiom logger so metrics are queryable via type: "memory_log".
 */

import { monitorEventLoopDelay, PerformanceObserver } from "node:perf_hooks";
import { logger } from "../external/logtail/logtailUtils.js";

// Event loop lag histogram — samples at 100ms resolution at the C++ level.
// No JS callbacks involved, negligible overhead.
const lagHistogram = monitorEventLoopDelay({ resolution: 100 });
lagHistogram.enable();

// GC pause tracking. observes V8 GC events and accumulates count, max and total
// pause duration. Reset alongside the lag histogram on each emit so windows align.
let gcCount = 0;
let gcMaxMs = 0;
let gcTotalMs = 0;

const gcObserver = new PerformanceObserver((list) => {
	for (const entry of list.getEntries()) {
		gcCount += 1;
		gcTotalMs += entry.duration;
		if (entry.duration > gcMaxMs) gcMaxMs = entry.duration;
	}
});
gcObserver.observe({ entryTypes: ["gc"] });

/** Get the current mean event loop lag in milliseconds. */
export function getEventLoopLagMs(): number {
	return Math.round((lagHistogram.mean / 1e6) * 10) / 10;
}

const DEFAULT_INTERVAL_MS = 60_000; // 1 minute

let intervalHandle: ReturnType<typeof setInterval> | null = null;

function toMB(bytes: number): number {
	return Math.round((bytes / 1024 / 1024) * 10) / 10;
}

function logMemoryUsage(label: string) {
	if (process.env.NODE_ENV === "development") {
		return;
	}

	const mem = process.memoryUsage();

	const lagMeanMs = Math.round((lagHistogram.mean / 1e6) * 10) / 10;
	const lagP99Ms = Math.round((lagHistogram.percentile(99) / 1e6) * 10) / 10;
	const lagMaxMs = Math.round((lagHistogram.max / 1e6) * 10) / 10;
	lagHistogram.reset();

	const localGcCount = gcCount;
	const localGcMaxMs = Math.round(gcMaxMs * 10) / 10;
	const localGcTotalMs = Math.round(gcTotalMs * 10) / 10;
	gcCount = 0;
	gcMaxMs = 0;
	gcTotalMs = 0;

	logger.info(
		`memory_log, rss: ${toMB(mem.rss)}MB, heapUsed: ${toMB(mem.heapUsed)}MB, eventLoopLagP99: ${lagP99Ms}ms, eventLoopLagMax: ${lagMaxMs}ms, gcMax: ${localGcMaxMs}ms`,
		{
			type: "memory_log",
			data: {
				label,
				pid: process.pid,
				rssMB: toMB(mem.rss),
				heapUsedMB: toMB(mem.heapUsed),
				heapTotalMB: toMB(mem.heapTotal),
				externalMB: toMB(mem.external),
				arrayBuffersMB: toMB(mem.arrayBuffers),
				nativeGapMB: toMB(mem.rss - mem.heapTotal - mem.external),
				eventLoopLagMeanMs: lagMeanMs,
				eventLoopLagP99Ms: lagP99Ms,
				eventLoopLagMaxMs: lagMaxMs,
				gcCount: localGcCount,
				gcMaxMs: localGcMaxMs,
				gcTotalMs: localGcTotalMs,
			},
		},
	);
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

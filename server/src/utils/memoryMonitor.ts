import { monitorEventLoopDelay } from "node:perf_hooks";
import { logger } from "../external/logtail/logtailUtils.js";

const lagHistogram = monitorEventLoopDelay({ resolution: 100 });
lagHistogram.enable();

export function getEventLoopLagMs(): number {
	return Math.round((lagHistogram.mean / 1e6) * 10) / 10;
}

const DEFAULT_INTERVAL_MS = 60_000;

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

	logger.info(
		`memory_log, rss: ${toMB(mem.rss)}MB, heapUsed: ${toMB(mem.heapUsed)}MB, eventLoopLagP99: ${lagP99Ms}ms, eventLoopLagMax: ${lagMaxMs}ms`,
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
			},
		},
	);
}

export function startMemoryMonitor(
	label: string,
	intervalMs = DEFAULT_INTERVAL_MS,
) {
	logMemoryUsage(label);

	intervalHandle = setInterval(() => {
		logMemoryUsage(label);
	}, intervalMs);

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

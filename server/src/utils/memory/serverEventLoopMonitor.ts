import { cpus } from "node:os";
import { monitorEventLoopDelay } from "node:perf_hooks";
import {
	STAGING_VARIANT_WINDOW_MS,
	stagingVariantsEnabled,
} from "@autumn/edge-config";
import { getAdminS3Config } from "@/external/aws/s3/adminS3Config.js";
import { logger } from "@/external/logtail/logtailUtils.js";
import { drainFinishedRequestCount } from "./inFlightRequests.js";

type CpuUsage = { user: number; system: number };

const NS_PER_MS = 1e6;

const round = (value: number) => Math.round(value * 100) / 100;

/** Field names match balance_worker.event_loop where the meaning is the same. */
export const summarizeServerEventLoopWindow = ({
	pid,
	cpuModel,
	windowMs,
	previousCpu,
	currentCpu,
	requests,
	lagP99Ns,
	lagMaxNs,
}: {
	pid: number;
	cpuModel: string | undefined;
	windowMs: number;
	previousCpu: CpuUsage;
	currentCpu: CpuUsage;
	requests: number;
	lagP99Ns: number;
	lagMaxNs: number;
}) => {
	const cpuUserMs = Math.round(currentCpu.user - previousCpu.user) / 1_000;
	const cpuSystemMs =
		Math.round(currentCpu.system - previousCpu.system) / 1_000;
	const cpuMs =
		Math.round(
			currentCpu.user +
				currentCpu.system -
				previousCpu.user -
				previousCpu.system,
		) / 1_000;
	return {
		pid,
		cpuModel,
		windowMs: round(windowMs),
		cpuMs,
		cpuUserMs,
		cpuSystemMs,
		cpuPct: windowMs > 0 ? round((cpuMs / windowMs) * 100) : 0,
		requests,
		eventLoopLagP99Ms: round(lagP99Ns / NS_PER_MS),
		eventLoopLagMaxMs: round(lagMaxNs / NS_PER_MS),
	};
};

/** Staging admin bucket only; returns whether the emitter started. */
export const startServerEventLoopMonitor = ({
	bucket = getAdminS3Config().bucket,
}: {
	bucket?: string;
} = {}): { started: boolean; stop: () => void } => {
	if (!stagingVariantsEnabled({ bucket })) {
		return { started: false, stop: () => {} };
	}

	const cpuModel = cpus()[0]?.model;
	const lag = monitorEventLoopDelay({ resolution: 10 });
	lag.enable();
	let previousCpu = process.cpuUsage();
	let windowStartedAt = performance.now();
	let timer: ReturnType<typeof setTimeout> | undefined;
	drainFinishedRequestCount();

	const report = () => {
		try {
			const currentCpu = process.cpuUsage();
			const now = performance.now();
			const data = summarizeServerEventLoopWindow({
				pid: process.pid,
				cpuModel,
				windowMs: now - windowStartedAt,
				previousCpu,
				currentCpu,
				requests: drainFinishedRequestCount(),
				lagP99Ns: lag.percentile(99),
				lagMaxNs: lag.max,
			});
			lag.reset();
			previousCpu = currentCpu;
			windowStartedAt = now;
			logger.info("Server event loop", { event: "server.event_loop", data });
		} catch {
			// Telemetry must never disturb the process it is measuring.
		}
		scheduleNext();
	};

	// Close on wall-clock window boundaries so lines align with the worker's.
	const scheduleNext = () => {
		const untilBoundary =
			STAGING_VARIANT_WINDOW_MS - (Date.now() % STAGING_VARIANT_WINDOW_MS);
		timer = setTimeout(report, untilBoundary);
		timer.unref();
	};

	scheduleNext();
	return {
		started: true,
		stop: () => {
			clearTimeout(timer);
			lag.disable();
		},
	};
};

import { cpus } from "node:os";
import { monitorEventLoopDelay } from "node:perf_hooks";
import {
	STAGING_VARIANT_WINDOW_MS,
	stagingVariantsBound,
	variant,
	variants,
} from "@autumn/edge-config";
import {
	type ServerCpuSampler,
	serverCpuTelemetryAllowed,
	summarizeProcessCpuWindow,
} from "@autumn/logging";
import {
	drainPoolAttribution,
	enablePoolAttribution,
} from "@/db/poolAttribution/poolAttribution.js";
import { getAdminS3Config } from "@/external/aws/s3/adminS3Config.js";
import { logger } from "@/external/logtail/logtailUtils.js";
import { getServerForkCount } from "./forkRecycling/recyclePolicy.js";
import {
	getServerForkBootArm,
	SERVER_FORK_EXPERIMENT,
} from "./forkRecycling/serverForkVariant.js";
import { drainFinishedRequestCount } from "./inFlightRequests.js";
import { SERVER_PHASE_CPU_EXPERIMENT } from "./phaseCpu/getServerCpuSampler.js";

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
	const cpu = summarizeProcessCpuWindow({
		previous: previousCpu,
		current: currentCpu,
		windowMs,
	});
	return {
		pid,
		cpuModel,
		windowMs: round(windowMs),
		...cpu,
		requests,
		eventLoopLagP99Ms: round(lagP99Ns / NS_PER_MS),
		eventLoopLagMaxMs: round(lagMaxNs / NS_PER_MS),
	};
};

/** Staging admin bucket only; returns whether the emitter started. */
export const startServerEventLoopMonitor = ({
	bucket = getAdminS3Config().bucket,
	phaseCpuSampler,
}: {
	bucket?: string;
	phaseCpuSampler?: ServerCpuSampler;
} = {}): { started: boolean; stop: () => void } => {
	if (!serverCpuTelemetryAllowed({ bucket, bound: stagingVariantsBound() })) {
		return { started: false, stop: () => {} };
	}

	enablePoolAttribution();
	const cpuModel = cpus()[0]?.model;
	const forkArm = getServerForkBootArm();
	const forkCount = getServerForkCount();
	const lag = monitorEventLoopDelay({ resolution: 10 });
	lag.enable();
	let previousCpu = process.cpuUsage();
	let windowStartedAt = performance.now();
	let timer: ReturnType<typeof setTimeout> | undefined;
	let stopped = false;
	let phaseCpuArm = variant(SERVER_PHASE_CPU_EXPERIMENT);
	drainFinishedRequestCount();
	phaseCpuSampler?.startWindow();

	const report = async () => {
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
			const cpuPhases = (await phaseCpuSampler?.finishWindow()) ?? null;
			if (stopped) return;
			logger.info("Server event loop", {
				event: "server.event_loop",
				data: {
					...data,
					forkArm,
					forkCount,
					poolAttribution: drainPoolAttribution(),
					phaseCpuArm,
					cpuPhases,
					variants: forkArm
						? { ...variants(), [SERVER_FORK_EXPERIMENT]: forkArm }
						: variants(),
				},
			});
		} catch {
			// Telemetry must never disturb the process it is measuring.
		}
		if (stopped) return;
		phaseCpuArm = variant(SERVER_PHASE_CPU_EXPERIMENT);
		phaseCpuSampler?.startWindow();
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
			stopped = true;
			clearTimeout(timer);
			lag.disable();
			void phaseCpuSampler?.finishWindow().catch(() => {});
		},
	};
};

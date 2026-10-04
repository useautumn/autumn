import type { AutumnLogger } from "@autumn/logging";
import type { LatencyWindow } from "../requestLatencies.js";
import {
	type CpuCounters,
	cpuWindowOf,
	readCpuCounters,
} from "./cpuCounters.js";
import type { SyncSectionRecorder } from "./syncSections.js";

type EventLoopStallMonitorConfig = {
	deployment: string;
	/** Which worker, so one saturated worker is not averaged away across the fleet. */
	endpoint: string;
	/** How often the probe timer should fire. */
	intervalMs: number;
	/** Lateness counted as a stall. */
	stallThresholdMs: number;
	/** Lateness that also gets its own log line, naming what held the thread. */
	logStallMs: number;
	reportEveryMs: number;
	cpuModel?: string;
};

const MAX_STALL_LOGS_PER_REPORT = 20;
const MAX_SECTIONS_PER_STALL = 5;

/**
 * A timer that should fire every `intervalMs`; however late it fires is how long
 * the thread was held. Each stall is matched against the timed synchronous
 * sections that finished inside it, so the log says what was running, not only
 * that something was.
 */
export function createEventLoopStallMonitor({
	ctx,
	config,
}: {
	ctx: {
		logger: Pick<AutumnLogger, "info" | "warn">;
		recorder: SyncSectionRecorder;
		now?: () => number;
		schedule?: (params: { intervalMs: number; run(): void }) => () => void;
		/** Read once per logged stall: a stall with nothing timed and a heap that just moved is the collector's. */
		memory?: () => { heapUsed: number; rss: number };
		cpu?: () => CpuCounters;
		/** Reports close on wall-clock `reportEveryMs` boundaries, the staging-variant windows. */
		wallNow?: () => number;
		/** Each live staging experiment's arm, read as a window opens: every report is one window's. */
		variants?: () => Readonly<Record<string, string>> | null;
		/** The window's request latency percentiles; drained once per report. */
		latencies?: () => LatencyWindow;
		/** Serial-decide arm D: what the hot decider answered and declined this window; drained once per report. */
		hot?: () => Readonly<Record<string, unknown>> | null;
	};
	config: EventLoopStallMonitorConfig;
}): { start(): void; stop(): void } {
	const now = ctx.now ?? (() => performance.now());
	const memory = ctx.memory ?? (() => process.memoryUsage());
	const cpu = ctx.cpu ?? (() => readCpuCounters());
	const wallNow = ctx.wallNow ?? Date.now;
	const windowOf = () => Math.floor(wallNow() / config.reportEveryMs);
	let lastCpu: CpuCounters | undefined;
	let cancel: (() => void) | undefined;
	let lastTickAt = 0;
	let lastReportAt = 0;
	let window = emptyWindow();
	let windowIndex = 0;
	let windowVariants: Readonly<Record<string, string>> | null = null;

	function tick(): void {
		try {
			const tickedAt = now();
			const lagMs = Math.max(0, tickedAt - lastTickAt - config.intervalMs);
			lastTickAt = tickedAt;
			if (lagMs >= config.stallThresholdMs) {
				recordStall({ tickedAt, lagMs });
			}
			if (windowOf() !== windowIndex) {
				report({ tickedAt });
			}
		} catch {
			// Telemetry must never disturb the thread it is measuring.
		}
	}

	function recordStall({
		tickedAt,
		lagMs,
	}: {
		tickedAt: number;
		lagMs: number;
	}): void {
		window.stalls += 1;
		window.stalledMs += lagMs;
		window.maxLagMs = Math.max(window.maxLagMs, lagMs);
		if (lagMs < config.logStallMs) return;
		if (window.stallLogs >= MAX_STALL_LOGS_PER_REPORT) return;
		window.stallLogs += 1;
		const sections = ctx.recorder
			.endedSince({ since: tickedAt - lagMs - config.intervalMs })
			.slice(0, MAX_SECTIONS_PER_STALL)
			.map(({ label, durationMs }) => ({
				label,
				durationMs: round(durationMs),
			}));
		const attributedMs = round(
			sections.reduce((sum, section) => sum + section.durationMs, 0),
		);
		const { heapUsed, rss } = memory();
		ctx.logger.warn(
			{
				event: "balance_worker.event_loop_stall",
				workerDeployment: config.deployment,
				data: {
					workerEndpoint: config.endpoint,
					lagMs: round(lagMs),
					sections,
					attributedMs,
					heapUsedMb: Math.round(heapUsed / 1_048_576),
					rssMb: Math.round(rss / 1_048_576),
				},
			},
			`Balance worker thread blocked ${round(lagMs)}ms${sections[0] ? ` (${sections[0].label} ${sections[0].durationMs}ms)` : " (unattributed)"}`,
		);
	}

	function report({ tickedAt }: { tickedAt: number }): void {
		const sections = Object.fromEntries(
			Object.entries(ctx.recorder.drainTotals()).map(([label, total]) => [
				label,
				{
					count: total.count,
					totalMs: round(total.totalMs),
					maxMs: round(total.maxMs),
				},
			]),
		);
		const windowMs = round(tickedAt - lastReportAt);
		const latencies = ctx.latencies?.() ?? {};
		const hot = ctx.hot?.() ?? null;
		const currentCpu = cpu();
		const cpuWindow = lastCpu
			? cpuWindowOf({ previous: lastCpu, current: currentCpu, windowMs })
			: {};
		lastCpu = currentCpu;
		ctx.logger.info(
			{
				event: "balance_worker.event_loop",
				workerDeployment: config.deployment,
				data: {
					workerEndpoint: config.endpoint,
					windowMs,
					stalls: window.stalls,
					stalledMs: round(window.stalledMs),
					maxLagMs: round(window.maxLagMs),
					cpuModel: config.cpuModel,
					...(windowVariants && { variants: windowVariants }),
					...cpuWindow,
					...latencies,
					...(hot && { hot }),
					sections,
				},
			},
			"Balance worker event loop",
		);
		lastReportAt = tickedAt;
		window = emptyWindow();
		openWindow();
	}

	function openWindow(): void {
		windowIndex = windowOf();
		windowVariants = ctx.variants?.() ?? null;
	}

	function start(): void {
		if (cancel) return;
		lastTickAt = now();
		lastReportAt = lastTickAt;
		lastCpu = cpu();
		ctx.recorder.drainTotals();
		openWindow();
		cancel = (ctx.schedule ?? scheduleProbe)({
			intervalMs: config.intervalMs,
			run: tick,
		});
	}

	function stop(): void {
		cancel?.();
		cancel = undefined;
	}

	return { start, stop };
}

function emptyWindow() {
	return { stalls: 0, stalledMs: 0, maxLagMs: 0, stallLogs: 0 };
}

function round(ms: number): number {
	return Math.round(ms * 100) / 100;
}

function scheduleProbe({
	intervalMs,
	run,
}: {
	intervalMs: number;
	run(): void;
}): () => void {
	const timer = setInterval(run, intervalMs);
	timer.unref();
	return () => clearInterval(timer);
}

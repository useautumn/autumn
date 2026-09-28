/**
 * Per-step worker boot timings, parsed from the `[tw-boot] +Nms <message>` lines
 * worker/boot.ts streams before READY. Each step lasts until the next marker.
 */

import {
	type DurationStats,
	formatDurations,
	summarizeDurations,
} from "./durationStats.js";
import { stripAnsi } from "./logSink.js";

/** Boot-log message prefixes (in boot order) that start each measured step. */
const BOOT_STEP_MARKERS = [
	{ prefix: "starting native services", step: "services up" },
	{ prefix: "native services healthy", step: "balance queue prep" },
	{ prefix: "reconciling node_modules", step: "bun install" },
	{ prefix: "applying pending DB migrations", step: "db migrate" },
	{ prefix: "binding orchestrator-created Svix app", step: "svix bind" },
	{ prefix: "binding Stripe sub-account", step: "stripe bind" },
	{ prefix: "starting Autumn server", step: "server load → health" },
	{ prefix: "server health OK", step: "end" },
] as const;

const BOOT_LINE_PATTERN = /\[tw-boot\] \+(\d+)ms (.+)/;

type BootMarker = { step: string; atMs: number };

type WorkerBootTrace = {
	execStartedAt: number;
	firstLineAt?: number;
	firstLineOffsetMs?: number;
	pendingText: string;
	markers: BootMarker[];
};

const traces = new Map<string, WorkerBootTrace>();

export const resetBootTraces = (): void => {
	traces.clear();
};

/** Call right before the boot exec so the exec + bun spin-up overhead is measured. */
export const startBootTrace = (worker: string): void => {
	traces.set(worker, {
		execStartedAt: Date.now(),
		pendingText: "",
		markers: [],
	});
};

const recordBootLine = ({
	trace,
	line,
}: {
	trace: WorkerBootTrace;
	line: string;
}): void => {
	const match = BOOT_LINE_PATTERN.exec(stripAnsi(line));
	if (!match) {
		return;
	}
	const atMs = Number(match[1]);
	if (trace.firstLineAt === undefined) {
		trace.firstLineAt = Date.now();
		trace.firstLineOffsetMs = atMs;
	}
	const marker = BOOT_STEP_MARKERS.find(({ prefix }) =>
		match[2].startsWith(prefix),
	);
	if (marker) {
		trace.markers.push({ step: marker.step, atMs });
	}
};

/** Feed raw (possibly partial, multi-line) boot output for one worker. */
export const recordBootOutput = ({
	worker,
	text,
}: {
	worker: string;
	text: string;
}): void => {
	const trace = traces.get(worker);
	if (!trace) {
		return;
	}
	const lines = `${trace.pendingText}${text}`.split("\n");
	trace.pendingText = lines.pop() ?? "";
	for (const line of lines) {
		recordBootLine({ trace, line });
	}
};

export type BootStepSummary = { step: string; stats: DurationStats };

export const summarizeBootTraces = (): BootStepSummary[] => {
	const durationsByStep = new Map<string, number[]>();
	const addDuration = ({ step, ms }: { step: string; ms: number }): void => {
		const durations = durationsByStep.get(step) ?? [];
		durations.push(ms);
		durationsByStep.set(step, durations);
	};

	for (const trace of traces.values()) {
		if (trace.firstLineAt !== undefined) {
			addDuration({
				step: "exec → boot.ts running",
				ms:
					trace.firstLineAt -
					trace.execStartedAt -
					(trace.firstLineOffsetMs ?? 0),
			});
		}
		for (const [index, marker] of trace.markers.entries()) {
			const next = trace.markers[index + 1];
			if (next && marker.step !== "end") {
				addDuration({ step: marker.step, ms: next.atMs - marker.atMs });
			}
		}
	}

	return [...durationsByStep.entries()].map(([step, durations]) => ({
		step,
		stats: summarizeDurations(durations),
	}));
};

export const formatBootSummary = (summaries: BootStepSummary[]): string[] => {
	const width = Math.max(...summaries.map(({ step }) => step.length), 0);
	return summaries.map(
		({ step, stats }) =>
			`      ${step.padEnd(width)}  ${formatDurations(stats)} (n=${stats.count})`,
	);
};

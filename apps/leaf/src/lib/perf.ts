import type { AutumnLogger } from "@autumn/logging";

/**
 * Lightweight latency profiler for one agent message. Records named phase
 * durations (sequential marks or wrapped async spans) and milestone timestamps,
 * then emits a single structured summary so a turn's breakdown is greppable in
 * one line — see where the first-response time actually goes.
 */
export type PhaseTimer = {
	/** Record a wrapped async span's wall-clock duration under `phase`. */
	time: <T>(phase: string, fn: () => Promise<T>) => Promise<T>;
	/** Record ms since the timer started, under `milestone` (e.g. first token). */
	milestone: (milestone: string) => void;
	/** Emit the consolidated summary log. */
	done: (event: string, extra?: Record<string, unknown>) => void;
};

export const createPhaseTimer = (logger: AutumnLogger): PhaseTimer => {
	const start = performance.now();
	const spans: Record<string, number> = {};
	const milestones: Record<string, number> = {};
	const order: string[] = [];

	return {
		async time(phase, fn) {
			const at = performance.now();
			try {
				return await fn();
			} finally {
				spans[phase] = (spans[phase] ?? 0) + (performance.now() - at);
				if (!order.includes(phase)) order.push(phase);
			}
		},
		milestone(name) {
			milestones[name] ??= performance.now() - start;
		},
		done(event, extra) {
			logger.info(`[perf] ${event}`, {
				event,
				data: {
					total_ms: Math.round(performance.now() - start),
					spans_ms: Object.fromEntries(
						order.map((phase) => [phase, Math.round(spans[phase] ?? 0)]),
					),
					milestones_ms: Object.fromEntries(
						Object.entries(milestones).map(([name, ms]) => [
							name,
							Math.round(ms),
						]),
					),
					...extra,
				},
			});
		},
	};
};

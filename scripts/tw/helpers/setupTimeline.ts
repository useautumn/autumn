/**
 * Wall-clock timeline of a run's setup phases (invocation → first test). Phases
 * record start/end independently, so overlapping (parallel) phases render correctly.
 */

export type PhaseTiming = {
	name: string;
	startMs: number;
	endMs?: number;
};

let runStartedAt = Date.now();
let phases: PhaseTiming[] = [];

export const resetSetupTimeline = (): void => {
	runStartedAt = Date.now();
	phases = [];
};

/** Milliseconds since the run started. */
export const elapsedMs = (): number => Date.now() - runStartedAt;

/** Record `fn` as a named phase; the end is recorded even when it throws. */
export const timePhase = async <T>({
	name,
	fn,
}: {
	name: string;
	fn: () => Promise<T>;
}): Promise<T> => {
	const phase: PhaseTiming = { name, startMs: elapsedMs() };
	phases.push(phase);
	try {
		return await fn();
	} finally {
		phase.endMs = elapsedMs();
	}
};

/** Record an instantaneous marker (e.g. `first-test`). */
export const markPhase = (name: string): void => {
	const now = elapsedMs();
	phases.push({ name, startMs: now, endMs: now });
};

export const getSetupTimeline = (): PhaseTiming[] =>
	phases.map((phase) => ({ ...phase }));

const seconds = (ms: number): string => `${(ms / 1000).toFixed(1)}s`;

export const formatSetupTimeline = (): string[] => {
	const nameWidth = Math.max(...phases.map((phase) => phase.name.length), 0);
	return phases.map((phase) => {
		const end = phase.endMs ?? elapsedMs();
		const duration =
			phase.endMs === undefined ? "running" : seconds(end - phase.startMs);
		return `  ${phase.name.padEnd(nameWidth)}  +${seconds(phase.startMs).padStart(6)} → +${seconds(end).padStart(6)}  ${duration}`;
	});
};

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

export const elapsedMs = (): number => Date.now() - runStartedAt;

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

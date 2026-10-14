// BENCH-ONLY (bench/bw-decide-steps-364): where one queued command's decide went, keyed by commandId.
export type DecideSteps = {
	claimMs: number;
	hydrateMs: number;
	resetMs: number;
	resetDue: number;
	computeMs: number;
};

const stepsByCommandId = new Map<string, DecideSteps>();

const emptySteps = (): DecideSteps => ({
	claimMs: 0,
	hydrateMs: 0,
	resetMs: 0,
	resetDue: 0,
	computeMs: 0,
});

export function addDecideStep({
	commandId,
	step,
	ms,
}: {
	commandId: string;
	step: keyof DecideSteps;
	ms: number;
}): void {
	const steps = stepsByCommandId.get(commandId) ?? emptySteps();
	steps[step] += ms;
	stepsByCommandId.set(commandId, steps);
}

export function takeDecideSteps({
	commandId,
}: {
	commandId: string;
}): DecideSteps {
	const steps = stepsByCommandId.get(commandId) ?? emptySteps();
	stepsByCommandId.delete(commandId);
	return steps;
}

export async function timeDecideStep<T>({
	commandId,
	step,
	run,
}: {
	commandId: string;
	step: keyof DecideSteps;
	run: () => Promise<T> | T;
}): Promise<T> {
	const started = performance.now();
	try {
		return await run();
	} finally {
		addDecideStep({ commandId, step, ms: performance.now() - started });
	}
}

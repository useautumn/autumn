export type BatchMigrationPagePhases = Record<string, number>;

export const timePhase = async <T>({
	phases,
	phase,
	run,
}: {
	phases: BatchMigrationPagePhases | undefined;
	phase: string;
	run: () => Promise<T>;
}): Promise<T> => {
	if (!phases) return run();
	const started = Date.now();
	try {
		return await run();
	} finally {
		phases[phase] = (phases[phase] ?? 0) + (Date.now() - started);
	}
};

export const addPhaseDuration = ({
	phases,
	phase,
	startedAt,
}: {
	phases: BatchMigrationPagePhases | undefined;
	phase: string;
	startedAt: number;
}): void => {
	if (!phases) return;
	phases[phase] = (phases[phase] ?? 0) + (Date.now() - startedAt);
};

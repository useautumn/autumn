export type AutumnLogger = {
	debug: (...args: unknown[]) => void;
	info: (...args: unknown[]) => void;
	warn: (...args: unknown[]) => void;
	error: (...args: unknown[]) => void;
	child: (opts: { context: Record<string, unknown>; onlyProd?: boolean }) => AutumnLogger;
};

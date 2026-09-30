// biome-ignore lint/suspicious/noControlCharactersInRegex: strips ANSI colour codes
const ANSI = /\u001B\[[0-9;]*m/g;

/** Worker server output matters for boot; once serving it's per-minute heartbeats × thousands of workers. */
export const createOutputGate = () => {
	const serving = new Set<string>();
	return {
		forwardWorker: (worker: string) => !serving.has(worker),
		markServing: (worker: string) => {
			serving.add(worker);
		},
	};
};

/** Boot lines the log sink re-echoes as `[<worker>] …`; the worker stream already carries them. */
export const isWorkerEchoLine = (line: string) =>
	/^\[tw-twd-[^\]]+\]/.test(line.replace(ANSI, "").trimStart());

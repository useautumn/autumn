// biome-ignore lint/suspicious/noControlCharactersInRegex: strips ANSI colour codes
const ANSI = /\u001B\[[0-9;]*m/g;

export const createOutputGate = () => {
	const serving = new Set<string>();
	return {
		forwardWorker: (worker: string) => !serving.has(worker),
		markServing: (worker: string) => {
			serving.add(worker);
		},
	};
};

export const isWorkerEchoLine = (line: string) =>
	/^\[tw-twd-[^\]]+\]/.test(line.replace(ANSI, "").trimStart());

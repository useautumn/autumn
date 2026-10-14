// biome-ignore lint/suspicious/noControlCharactersInRegex: strips ANSI colour codes
const ANSI = /\u001B\[[0-9;]*m/g;
/** bun's own per-test and hook timeout lines, never a test's "timed out waiting for …" message. */
const BUN_TIMEOUT =
	/this test timed out after (\d+)ms|(a \w+\/\w+ hook) timed out for this test/;
const TAIL_CHARS = 160;

type FileTimeouts = {
	attempt: number;
	tail: string;
	byAttempt: Map<number, string>;
};

export const createTimeoutTracker = () => {
	const files = new Map<string, FileTimeouts>();

	const record = ({
		file,
		attempt,
		chunk,
	}: {
		file: string;
		attempt: number;
		chunk: string;
	}) => {
		const entry = files.get(file) ?? {
			attempt,
			tail: "",
			byAttempt: new Map(),
		};
		files.set(file, entry);
		if (entry.attempt !== attempt) entry.tail = "";
		entry.attempt = attempt;
		const text = `${entry.tail}${chunk}`.replace(ANSI, "");
		entry.tail = text.slice(-TAIL_CHARS);
		if (entry.byAttempt.has(attempt)) return;
		const match = text.match(BUN_TIMEOUT);
		if (!match) return;
		entry.byAttempt.set(
			attempt,
			match[1] ? `timed out after ${match[1]}ms` : `${match[2]} timed out`,
		);
	};

	return {
		record,
		timeouts: ({ file }: { file: string }) =>
			files.get(file)?.byAttempt ?? new Map<number, string>(),
	};
};

export const classifyFailedFile = ({
	attempt,
	verdicts,
	crashed,
	timeouts,
}: {
	attempt: number;
	verdicts: number;
	crashed: boolean;
	timeouts: Map<number, string>;
}): { status: "failed" | "crashed" | "timed_out"; timeout: string | null } => {
	const own = timeouts.get(attempt);
	if (own)
		return { status: "timed_out", timeout: `${own} (attempt ${attempt})` };
	const earlier = [...timeouts].find(([n]) => n < attempt);
	if (earlier && verdicts === 0)
		return {
			status: "timed_out",
			timeout: `${earlier[1]} (attempt ${earlier[0]}); attempt ${attempt} printed no results`,
		};
	return { status: crashed ? "crashed" : "failed", timeout: null };
};

// biome-ignore lint/suspicious/noControlCharactersInRegex: strips ANSI colour codes
const ANSI = /\u001B\[[0-9;]*m/g;
/** bun's own per-test and hook timeout lines, never a test's "timed out waiting for …" message. */
const BUN_TIMEOUT =
	/this test timed out after (\d+)ms|(a \w+\/\w+ hook) timed out for this test/;
/** Enough to rejoin a marker split across output chunks. */
const TAIL_CHARS = 160;

type FileTimeouts = {
	attempt: number;
	tail: string;
	byAttempt: Map<number, string>;
};

/** Which attempts of each file hit bun's per-test timeout, read from the streamed test output. */
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
		// A new attempt's output must not complete a marker the previous attempt started.
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

/**
 * A finished, failed file is timed_out when its final attempt hit bun's timeout, or printed no
 * verdicts at all after an earlier attempt timed out (the retry of a 300s test often dies silently).
 */
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

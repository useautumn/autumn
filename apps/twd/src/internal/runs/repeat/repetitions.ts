import {
	isFailedFileStatus,
	type RepeatStat,
	type RunFile,
} from "../../../api/contract.ts";
import { TwdError } from "../../../http/apiError.ts";

/** A repeat run's total size cap: about one mid-sized group sweep, so a flake check can't swamp the pool. */
export const MAX_REPEAT_WORK_ITEMS = 200;

const REPETITION_ID = /^(.*)#(\d+)$/;

export const toRepetitionId = ({
	file,
	repetition,
}: {
	file: string;
	repetition: number;
}) => `${file}#${repetition}`;

/** `a.test.ts#3` → `{ file: "a.test.ts", repetition: 3 }`; a plain id has no repetition. */
export const splitRepetitionId = ({
	id,
}: {
	id: string;
}): { file: string; repetition: number | null } => {
	const match = REPETITION_ID.exec(id);
	return match
		? { file: match[1] ?? id, repetition: Number(match[2]) }
		: { file: id, repetition: null };
};

/** One work item per file per repetition; repeat=1 keeps plain ids so normal runs are unchanged. */
export const planWorkItems = ({
	files,
	repeat,
}: {
	files: string[];
	repeat: number;
}): string[] => {
	if (repeat <= 1) return files;
	const total = files.length * repeat;
	if (total > MAX_REPEAT_WORK_ITEMS) {
		throw new TwdError({
			status: 400,
			code: "repeat_too_large",
			message: `${files.length} file(s) × repeat ${repeat} = ${total} runs; a repeat run is capped at ${MAX_REPEAT_WORK_ITEMS}.`,
			next: "Repeat only the flaky file(s) you are checking, or lower repeat.",
			details: { files: files.length, repeat, max: MAX_REPEAT_WORK_ITEMS },
		});
	}
	return files.flatMap((file) =>
		Array.from({ length: repeat }, (_, index) =>
			toRepetitionId({ file, repetition: index + 1 }),
		),
	);
};

/** Per file X/N: X counts first-attempt passes, so a pass on retry still reads as a flake. */
export const summariseRepeats = ({
	files,
}: {
	files: RunFile[];
}): RepeatStat[] => {
	const stats = new Map<string, RepeatStat>();
	for (const runFile of files) {
		const { file, repetition } = splitRepetitionId({ id: runFile.file });
		if (repetition === null) continue;
		const stat = stats.get(file) ?? {
			file,
			total: 0,
			done: 0,
			firstAttemptPassed: 0,
			passedOnRetry: 0,
			failed: 0,
		};
		stat.total++;
		if (runFile.status !== "queued" && runFile.status !== "running")
			stat.done++;
		if (runFile.status === "passed") {
			if (runFile.attempt > 1) stat.passedOnRetry++;
			else stat.firstAttemptPassed++;
		}
		if (isFailedFileStatus(runFile.status)) stat.failed++;
		stats.set(file, stat);
	}
	return [...stats.values()];
};

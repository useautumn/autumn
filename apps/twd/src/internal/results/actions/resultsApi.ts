import type { RunFile } from "../../../api/contract.ts";
import type { TwdContext } from "../../../lib/types/twdContext.ts";

/** Frozen cross-task API for results. OWNED BY THE RESULTS TASK. */

/** Append one finished-file row to test_results. */
export const recordFileResult = async (_args: {
	ctx: TwdContext;
	runId: string;
	branch: string;
	sha: string;
	result: RunFile;
}): Promise<void> => {
	throw new Error("recordFileResult: not implemented");
};

/** Longest-first by baseline p90; files without history first. */
export const orderFilesLongestFirst = async (_args: {
	ctx: TwdContext;
	files: string[];
}): Promise<string[]> => {
	throw new Error("orderFilesLongestFirst: not implemented");
};

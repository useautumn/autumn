import { isFailedFileStatus } from "../../../api/contract.ts";
import type { DevResult, FileDevStatus } from "../types/resultsSchemas.ts";

const UNIT_PREFIX = "unit/";

const noDataReason = ({
	file,
	skippedOnly,
}: {
	file: string;
	skippedOnly: boolean;
}) => {
	if (skippedOnly)
		return "Every recent dev result was skipped, so there is no pass/fail signal.";
	if (file.startsWith(UNIT_PREFIX))
		return "No dev results: unit tests reach twd only from the Server Unit Tests CI upload on dev pushes that touch server/ or shared/, and none has covered this path yet (new, renamed, or uploads not running). Check the latest dev Server Unit Tests run instead.";
	return "No dev results: this file is not in any dev baseline or dev run yet (new, renamed, or outside the 'all' group). Run it on dev with start_run to find out.";
};

/**
 * passed = every recent dev result passed first try; failing = the latest two failed (or the only one);
 * anything mixed, or passing only on retry, is flaky.
 */
export const classifyDevResults = ({
	file,
	recent,
}: {
	file: string;
	recent: DevResult[];
}): FileDevStatus => {
	const scored = recent.filter((r) => r.status !== "skipped");
	const [latest, previous] = scored;
	if (!latest) {
		return {
			file,
			status: "no_data",
			reason: noDataReason({ file, skippedOnly: recent.length > 0 }),
			passRate: null,
			samples: 0,
			latest: recent[0] ?? null,
			recent,
		};
	}

	const passes = scored.filter((r) => r.status === "passed");
	const failedLatestTwo =
		isFailedFileStatus(latest.status) &&
		(!previous || isFailedFileStatus(previous.status));
	const cleanPasses =
		passes.length === scored.length && passes.every((r) => r.attempt === 1);

	return {
		file,
		status: failedLatestTwo ? "failing" : cleanPasses ? "passed" : "flaky",
		reason: null,
		passRate: passes.length / scored.length,
		samples: scored.length,
		latest,
		recent,
	};
};

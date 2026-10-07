import { parseSubjectState, type SubjectState } from "@autumn/balance-engine";

/**
 * The state a snapshot row stands in for, or null when the row will not parse: its key and version were the
 * statement's to check, so parsing is the whole rule. Revision starts at zero, what a full read answers.
 */
export const snapshotStateOf = ({
	snapshot,
}: {
	snapshot: unknown;
}): SubjectState | null => {
	try {
		return { ...parseSubjectState({ input: snapshot }), revision: 0 };
	} catch {
		return null;
	}
};

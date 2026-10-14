import { parseSubjectState, type SubjectState } from "@autumn/balance-engine";

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

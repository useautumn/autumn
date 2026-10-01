import type {
	SubjectMapBudget,
	SubjectMapBudgetMember,
} from "./types/subjectMapBudget.js";

export const SUBJECT_MAP_FALLBACK_BUDGET_BYTES = 256 * 1024 * 1024;

export const subjectMapBudgetBytesOf = ({
	containerMemoryBytes,
	memoryFraction,
	overrideBytes,
}: {
	containerMemoryBytes: number | null;
	memoryFraction: number;
	overrideBytes?: number;
}): number => {
	if (overrideBytes !== undefined) return overrideBytes;
	if (containerMemoryBytes === null) return SUBJECT_MAP_FALLBACK_BUDGET_BYTES;
	return Math.floor(containerMemoryBytes * memoryFraction);
};

export const createSubjectMapBudget = ({
	totalBytes,
}: {
	totalBytes: number;
}): SubjectMapBudget => {
	if (!(totalBytes > 0)) throw new RangeError("totalBytes must be positive");
	let members = 0;
	const shareBytes = () => Math.floor(totalBytes / Math.max(members, 1));
	const join = (): SubjectMapBudgetMember => {
		members += 1;
		let left = false;
		return {
			maxBytes: shareBytes,
			leave: () => {
				if (left) return;
				left = true;
				members -= 1;
			},
		};
	};
	return { totalBytes, members: () => members, join };
};

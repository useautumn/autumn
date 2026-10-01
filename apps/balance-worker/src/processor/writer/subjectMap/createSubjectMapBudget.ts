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
	const holders = new Set<{ sizeBytes: () => number }>();
	const equalShare = () => Math.floor(totalBytes / Math.max(holders.size, 1));
	const join = ({
		sizeBytes,
	}: {
		sizeBytes: () => number;
	}): SubjectMapBudgetMember => {
		const holder = { sizeBytes };
		holders.add(holder);
		return {
			maxBytes: () => {
				let heldByOthers = 0;
				for (const other of holders)
					if (other !== holder) heldByOthers += other.sizeBytes();
				return Math.max(totalBytes - heldByOthers, equalShare());
			},
			leave: () => {
				holders.delete(holder);
			},
		};
	};
	return { totalBytes, members: () => holders.size, join };
};

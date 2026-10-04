/**
 * A paired A/B experiment: one staging build carries every arm's code path and each task hashes its
 * 10 s windows across A (control) and B..D, so each arm sees the same workload. Branches flip `enabled`.
 */
export const AB_EXPERIMENT: { enabled: boolean; arms: 2 | 3 | 4 } = {
	enabled: false,
	arms: 2,
};

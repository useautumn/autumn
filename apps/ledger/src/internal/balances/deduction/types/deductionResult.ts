import type { MutationLogItem } from "../../../../api/types/mutationLogItem.js";
import type { SubjectBalance } from "../../types/subjectBalance.js";

export type DeductionResult = {
	mutations: MutationLogItem[];
	// Every entitlement the kernel folded, at the numbers it settled on.
	balancesAfter: Record<string, SubjectBalance>;
	// Per request, the part of the amount no bucket could take.
	remainingByFeatureId: Record<string, number>;
};

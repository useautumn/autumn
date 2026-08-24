import type { MutationLogItem } from "../../../api/types/mutationLogItem.js";
import type { SubjectBalance } from "./subjectBalance.js";

// The desired change to subject state: what execute applies and the ledger
// entry carries verbatim. Rollovers, usage windows and locks join it later.
export type BalancePlan = {
	mutations: MutationLogItem[];
	after: Record<string, SubjectBalance>;
	remaining: number;
};

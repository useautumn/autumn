import type { SubjectState } from "@autumn/balance-engine";

export type SubjectRead = {
	baseline: SubjectState;
	baselineAt: number;
	bytes?: number;
};

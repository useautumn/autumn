import type { SubjectState } from "@autumn/balance-engine";

/** A subject's rows read whole, and the time they were read for. */
export type SubjectRead = {
	baseline: SubjectState;
	baselineAt: number;
};

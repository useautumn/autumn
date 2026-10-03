import { createTrackDecisions } from "./createTrackDecisions.js";
import type {
	SubjectDecisionCounters,
	SubjectDecisions,
} from "./types/subjectDecisions.js";

/** Tracks carry their decisions across balance-only writes. */
export const createSubjectDecisions = (): SubjectDecisions => {
	const counters: SubjectDecisionCounters = {
		trackContextHits: 0,
		trackContextMisses: 0,
		effectsRun: 0,
		effectsSkipped: 0,
	};

	function readCounters(): SubjectDecisionCounters {
		return { ...counters };
	}

	return { ...createTrackDecisions({ counters }), readCounters };
};

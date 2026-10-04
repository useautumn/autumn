import {
	type DeductionContext,
	type DeductionRequest,
	type DeductionSelection,
	deductionSelectionToKey,
	setupDeductionContext,
	type WorkerFullSubject,
} from "@autumn/balance-engine";
import type { CheckReply } from "@autumn/balance-worker-client/protocol";
import { createTrackDecisions } from "./createTrackDecisions.js";
import type {
	SubjectDecision,
	SubjectDecisionCounters,
	SubjectDecisions,
} from "./types/subjectDecisions.js";

/** How long a decision may answer for a moving clock: rollover, grant and window boundaries land at most this late. */
const DECISION_SECOND_MS = 1_000;

/** Checks are keyed on the joined view, one object per (state, entity, catalog version), and die with it on a write;
 *  tracks carry theirs across balance-only writes. */
export const createSubjectDecisions = (): SubjectDecisions => {
	const decisionsByView = new WeakMap<
		WorkerFullSubject,
		Map<string, SubjectDecision>
	>();
	const counters: SubjectDecisionCounters = {
		checkMemoHits: 0,
		checkMemoMisses: 0,
		checkMemoBypassed: 0,
		trackContextHits: 0,
		trackContextMisses: 0,
		effectsRun: 0,
		effectsSkipped: 0,
	};
	const trackDecisions = createTrackDecisions({ counters });

	/** One entry per selection: a new second replaces it, so a view read for hours holds no history. */
	function decisionOf({
		fullSubject,
		selection,
	}: {
		fullSubject: WorkerFullSubject;
		selection: DeductionSelection;
	}): SubjectDecision | null {
		// A check reply carries no context to vouch for its properties, so a check with any is decided afresh.
		if (selection.properties !== null) return null;
		const key = deductionSelectionToKey({ selection });
		const second = Math.floor(selection.now / DECISION_SECOND_MS);
		let decisions = decisionsByView.get(fullSubject);
		if (!decisions) {
			decisions = new Map();
			decisionsByView.set(fullSubject, decisions);
		}
		const existing = decisions.get(key);
		if (existing?.second === second) return existing;
		const decision: SubjectDecision = {
			second,
			context: setupDeductionContext({ fullSubject, selection }),
			checkReplies: new Map(),
		};
		decisions.set(key, decision);
		return decision;
	}

	function readCheckReply({
		fullSubject,
		request,
		answer,
	}: {
		fullSubject: WorkerFullSubject;
		request: DeductionRequest;
		answer: (params: { context: DeductionContext }) => CheckReply;
	}): CheckReply {
		const decision = decisionOf({ fullSubject, selection: request.selection });
		if (!decision) {
			counters.checkMemoBypassed++;
			return answer({
				context: setupDeductionContext({
					fullSubject,
					selection: request.selection,
				}),
			});
		}
		const known = decision.checkReplies.get(request.value);
		if (known) {
			counters.checkMemoHits++;
			return known;
		}
		counters.checkMemoMisses++;
		const reply = answer({ context: decision.context });
		decision.checkReplies.set(request.value, reply);
		return reply;
	}

	function readCounters(): SubjectDecisionCounters {
		return { ...counters };
	}

	return { readCheckReply, ...trackDecisions, readCounters };
};

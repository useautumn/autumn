import {
	advanceDeductionContext,
	type Catalog,
	type DeductionRequest,
	deductionContextToExpiresAt,
	deductionSelectionToKey,
	type MeteringIdentity,
	type RowChange,
	type SubjectState,
	setupDeductionContext,
	type WorkerFullSubject,
} from "@autumn/balance-engine";
import { subjectAlwaysDecidesEffects } from "../../effects/shouldDecideEffects.js";
import type {
	SubjectDecisionCounters,
	SubjectDecisions,
	TrackDecision,
} from "./types/subjectDecisions.js";

type TrackCounters = Pick<
	SubjectDecisionCounters,
	"trackContextHits" | "trackContextMisses" | "effectsRun" | "effectsSkipped"
>;

/** Keyed on the state object: a balance-only write advances every entry to the next state, any other write drops them. */
export const createTrackDecisions = ({
	counters,
}: {
	counters: TrackCounters;
}): Pick<
	SubjectDecisions,
	"readTrackDecision" | "advance" | "countEffects"
> => {
	const decisionsByState = new WeakMap<
		SubjectState,
		Map<string, TrackDecision>
	>();

	function isCurrent({
		decision,
		catalog,
		now,
	}: {
		decision: TrackDecision;
		catalog: Catalog;
		now: number;
	}): boolean {
		return (
			decision.catalog === catalog &&
			now >= decision.validFrom &&
			now < decision.validUntil
		);
	}

	/** A context the event's properties shaped serves only the property-free selection it was carried for. */
	function servesProperties({
		decision,
		selection,
	}: {
		decision: TrackDecision;
		selection: DeductionRequest["selection"];
	}): boolean {
		return !decision.context.readsProperties || selection.properties === null;
	}

	function readTrackDecision({
		state,
		identity,
		request,
		catalog,
		join,
	}: {
		state: SubjectState;
		identity: MeteringIdentity;
		request: DeductionRequest;
		catalog: Catalog;
		join: () => WorkerFullSubject;
	}) {
		const { selection } = request;
		const selectionKey = deductionSelectionToKey({ selection });
		const key = `${identity.entityId ?? ""}|${selectionKey}`;
		const known = decisionsByState.get(state)?.get(key);
		if (
			known &&
			isCurrent({ decision: known, catalog, now: selection.now }) &&
			servesProperties({ decision: known, selection })
		) {
			counters.trackContextHits++;
			// The rows are the same until `validUntil`; the draw stamps the request's own clock.
			return { ...known, context: { ...known.context, selection } };
		}
		counters.trackContextMisses++;
		const fullSubject = join();
		const context = setupDeductionContext({ fullSubject, selection });
		const decision: TrackDecision = {
			context,
			fullSubject,
			catalog,
			validFrom: selection.now,
			validUntil: deductionContextToExpiresAt({ context }),
			alwaysDecidesEffects: subjectAlwaysDecidesEffects({ fullSubject }),
		};
		// Gates and windowed caps read more than the rows' balances, so their contexts are never carried.
		const carries =
			context.allocationGates.size === 0 &&
			context.usageWindowLimits.length === 0 &&
			(selection.properties === null || !context.readsProperties);
		if (carries) remember({ state, key, decision });
		return decision;
	}

	function remember({
		state,
		key,
		decision,
	}: {
		state: SubjectState;
		key: string;
		decision: TrackDecision;
	}): void {
		let decisions = decisionsByState.get(state);
		if (!decisions) {
			decisions = new Map();
			decisionsByState.set(state, decisions);
		}
		decisions.set(key, decision);
	}

	function advance({
		from,
		to,
		changes,
	}: {
		from: SubjectState | null;
		to: SubjectState;
		changes: RowChange[];
	}): void {
		const decisions = from && decisionsByState.get(from);
		if (!decisions) return;
		const advanced = new Map<string, TrackDecision>();
		for (const [key, decision] of decisions) {
			const context = advanceDeductionContext({
				context: decision.context,
				changes,
			});
			if (!context) return;
			advanced.set(key, { ...decision, context });
		}
		decisionsByState.set(to, advanced);
	}

	function countEffects({ decided }: { decided: boolean }): void {
		if (decided) counters.effectsRun++;
		else counters.effectsSkipped++;
	}

	return { readTrackDecision, advance, countEffects };
};

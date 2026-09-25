import type {
	DeductionOutcome,
	WorkerFullSubject,
} from "@autumn/balance-engine";
import {
	type Feature,
	fullSubjectToCustomerEntitlements,
} from "@autumn/shared";
import { findFeatureOnSubject } from "../findSubject/findFeatureOnSubject.js";

/** A finalize's unwind can land on a row the selection left out (a past-due product, an expired rollover); its feature is read off the subject. */
const featuresOfRowsOnSubject = ({
	fullSubject,
	rowIds,
	now,
}: {
	fullSubject: WorkerFullSubject;
	rowIds: Set<string>;
	now: number;
}): Feature[] =>
	fullSubjectToCustomerEntitlements({ fullSubject, now })
		.filter(
			(customerEntitlement) =>
				rowIds.has(customerEntitlement.id) ||
				customerEntitlement.rollovers.some(({ id }) => rowIds.has(id)),
		)
		.map((customerEntitlement) => customerEntitlement.entitlement.feature);

/**
 * The features whose rows the deduction moved: the tracked one, and a credit system that paid for it.
 * Prod checks every one of them; with nothing moved it falls back to the tracked feature.
 */
export const outcomeToAffectedFeatures = ({
	outcome,
	fullSubject,
	trackedFeatureId,
}: {
	outcome: DeductionOutcome;
	fullSubject: WorkerFullSubject;
	trackedFeatureId: string;
}): Feature[] => {
	const { context, deltas } = outcome;
	const { now } = context.selection;
	const featureById = new Map(
		context.customerEntitlements.map(({ entitlement: { feature } }) => [
			feature.id,
			feature,
		]),
	);
	const rows = [...context.rows, ...context.rolloverRows];

	const affected = new Map<string, Feature>();
	const unselectedRowIds = new Set<string>();
	for (const delta of deltas) {
		const row = rows.find(
			(candidate) =>
				candidate.table === delta.table && candidate.id === delta.id,
		);
		const feature = row && featureById.get(row.featureId);
		if (feature) affected.set(feature.id, feature);
		else unselectedRowIds.add(delta.id);
	}
	if (unselectedRowIds.size > 0) {
		for (const feature of featuresOfRowsOnSubject({
			fullSubject,
			rowIds: unselectedRowIds,
			now,
		})) {
			affected.set(feature.id, feature);
		}
	}
	if (affected.size > 0) return [...affected.values()];

	const tracked = findFeatureOnSubject({
		fullSubject,
		featureId: trackedFeatureId,
		now,
	});
	return tracked ? [tracked] : [];
};

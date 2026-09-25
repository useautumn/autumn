import type { Feature } from "@autumn/shared";
import type { DeductionOutcome } from "../types/deductionOutcome.js";

/** The features whose balances the deduction moved: the tracked one, and any credit system that paid for it. */
export const deductionOutcomeToMovedFeatures = ({
	outcome,
}: {
	outcome: DeductionOutcome;
}): Feature[] => {
	const { context, deltas } = outcome;
	const rows = [...context.rows, ...context.rolloverRows];
	const movedFeatureIds = new Set(
		deltas.flatMap((delta) => {
			const row = rows.find(
				(candidate) =>
					candidate.table === delta.table && candidate.id === delta.id,
			);
			return row ? [row.featureId] : [];
		}),
	);
	const featuresById = new Map(
		context.customerEntitlements.map((customerEntitlement) => [
			customerEntitlement.entitlement.feature.id,
			customerEntitlement.entitlement.feature,
		]),
	);
	return [...movedFeatureIds].flatMap((featureId) => {
		const feature = featuresById.get(featureId);
		return feature ? [feature] : [];
	});
};

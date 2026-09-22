import type { MutationRecord, WorkerFullSubject } from "@autumn/balance-engine";
import {
	type Feature,
	fullSubjectToCustomerEntitlements,
} from "@autumn/shared";

const changedRowIds = ({ record }: { record: MutationRecord }): Set<string> =>
	new Set(
		record.changes.flatMap((change) => {
			const isBalanceTable =
				change.table === "customerEntitlements" || change.table === "rollovers";
			if (!isBalanceTable) return [];
			return [change.op === "insert" ? change.row.id : change.id];
		}),
	);

/**
 * The features whose rows the mutation moved: the tracked one, and a credit system that paid for it.
 * Prod checks every one of them; with nothing moved it falls back to the tracked feature.
 */
export const recordToAffectedFeatures = ({
	record,
	fullSubject,
	trackedFeatureId,
}: {
	record: MutationRecord;
	fullSubject: WorkerFullSubject;
	trackedFeatureId: string;
}): Feature[] => {
	const changed = changedRowIds({ record });
	const byId = new Map<string, Feature>();
	for (const customerEntitlement of fullSubjectToCustomerEntitlements({
		fullSubject,
		now: record.command.occurredAt,
	})) {
		const moved =
			changed.has(customerEntitlement.id) ||
			customerEntitlement.rollovers.some(({ id }) => changed.has(id));
		if (moved) {
			const { feature } = customerEntitlement.entitlement;
			byId.set(feature.id, feature);
		}
	}
	if (byId.size > 0) return [...byId.values()];
	const tracked = fullSubjectToCustomerEntitlements({
		fullSubject,
		featureIds: [trackedFeatureId],
		now: record.command.occurredAt,
	})[0]?.entitlement.feature;
	return tracked ? [tracked] : [];
};

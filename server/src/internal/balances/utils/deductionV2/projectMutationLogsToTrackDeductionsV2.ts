import {
	type FullSubject,
	fullSubjectToCustomerEntitlements,
	type TrackDeduction,
} from "@autumn/shared";
import type { MutationLogItem } from "../types/mutationLogItem.js";

export const projectMutationLogsToTrackDeductionsV2 = ({
	fullSubject,
	mutationLogs,
}: {
	fullSubject: FullSubject;
	mutationLogs: MutationLogItem[];
}): TrackDeduction[] => {
	if (mutationLogs.length === 0) return [];

	const customerEntitlements = fullSubjectToCustomerEntitlements({
		fullSubject,
	});

	const customerEntitlementIdToFeatureId = new Map<string, string>();
	const rolloverIdToFeatureId = new Map<string, string>();

	for (const customerEntitlement of customerEntitlements) {
		const featureId = customerEntitlement.entitlement.feature.id;
		customerEntitlementIdToFeatureId.set(customerEntitlement.id, featureId);
		for (const rollover of customerEntitlement.rollovers ?? []) {
			rolloverIdToFeatureId.set(rollover.id, featureId);
		}
	}

	// cus_ent_* and rollover_* share the same `balance_id` namespace in the
	// public shape, but their internal types are scoped separately — qualify
	// with the type when aggregating so the namespaces can't collide.
	const aggregated = new Map<string, TrackDeduction>();

	for (const log of mutationLogs) {
		if (log.balance_delta === 0) continue;

		let balanceId: string;
		let featureId: string | undefined;
		let typeQualifier: string;

		if (
			log.target_type === "customer_entitlement" &&
			log.customer_entitlement_id
		) {
			balanceId = log.customer_entitlement_id;
			featureId = customerEntitlementIdToFeatureId.get(balanceId);
			typeQualifier = "ce";
		} else if (log.target_type === "rollover" && log.rollover_id) {
			balanceId = log.rollover_id;
			featureId = rolloverIdToFeatureId.get(balanceId);
			typeQualifier = "ro";
		} else {
			continue;
		}

		if (!featureId) continue;

		const key = `${typeQualifier}::${balanceId}`;
		const existing = aggregated.get(key);
		// Lua emits balance_delta as negative for deductions; flip so the public
		// shape reads "amount consumed = positive".
		const valueDelta = -log.balance_delta;

		if (existing) {
			existing.value += valueDelta;
			continue;
		}

		aggregated.set(key, {
			balance_id: balanceId,
			feature_id: featureId,
			value: valueDelta,
		});
	}

	return [...aggregated.values()];
};

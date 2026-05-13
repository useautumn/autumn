import {
	cusEntsToPlanId,
	cusEntsToReset,
	type FullCusEntWithFullCusProduct,
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

	const customerEntitlementById = new Map<string, FullCusEntWithFullCusProduct>();
	const rolloverIdToCustomerEntitlement = new Map<
		string,
		FullCusEntWithFullCusProduct
	>();

	for (const customerEntitlement of customerEntitlements) {
		customerEntitlementById.set(customerEntitlement.id, customerEntitlement);
		for (const rollover of customerEntitlement.rollovers ?? []) {
			rolloverIdToCustomerEntitlement.set(rollover.id, customerEntitlement);
		}
	}

	// cus_ent_* and rollover_* share the same `balance_id` namespace in the
	// public shape, but their internal types are scoped separately — qualify
	// with the type when aggregating so the namespaces can't collide.
	const aggregated = new Map<string, TrackDeduction>();

	for (const log of mutationLogs) {
		if (log.balance_delta === 0) continue;

		let balanceId: string;
		let customerEntitlement: FullCusEntWithFullCusProduct | undefined;
		let typeQualifier: string;

		if (
			log.target_type === "customer_entitlement" &&
			log.customer_entitlement_id
		) {
			balanceId = log.customer_entitlement_id;
			customerEntitlement = customerEntitlementById.get(balanceId);
			typeQualifier = "ce";
		} else if (log.target_type === "rollover" && log.rollover_id) {
			balanceId = log.rollover_id;
			customerEntitlement = rolloverIdToCustomerEntitlement.get(balanceId);
			typeQualifier = "ro";
		} else {
			continue;
		}

		if (!customerEntitlement) continue;

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
			feature_id: customerEntitlement.entitlement.feature.id,
			plan_id: cusEntsToPlanId({ cusEnts: [customerEntitlement] }),
			reset: cusEntsToReset({ cusEnts: [customerEntitlement] }),
			value: valueDelta,
		});
	}

	return [...aggregated.values()];
};

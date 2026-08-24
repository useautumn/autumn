import {
	cusEntsToPlanId,
	cusEntsToReset,
	type FullCusEntWithFullCusProduct,
	type TrackDeduction,
} from "@autumn/shared";
import type { MutationLogItem } from "../types/mutationLogItem.js";

// Row 101: one entry per touched balance row, aggregated, with the sign
// flipped so consumption reads positive.
export const mutationsToTrackDeductions = ({
	mutations,
	customerEntitlements,
}: {
	mutations: MutationLogItem[];
	customerEntitlements: FullCusEntWithFullCusProduct[];
}): TrackDeduction[] => {
	const customerEntitlementById = new Map(
		customerEntitlements.map((customerEntitlement) => [
			customerEntitlement.id,
			customerEntitlement,
		]),
	);
	const aggregated = new Map<string, TrackDeduction>();

	for (const mutation of mutations) {
		if (mutation.balance_delta === 0) continue;

		const balanceId = mutation.customer_entitlement_id;
		if (!balanceId) continue;

		const customerEntitlement = customerEntitlementById.get(balanceId);
		if (!customerEntitlement) continue;

		const existing = aggregated.get(balanceId);
		if (existing) {
			existing.value += -mutation.balance_delta;
			continue;
		}

		aggregated.set(balanceId, {
			balance_id: balanceId,
			feature_id: customerEntitlement.entitlement.feature.id,
			plan_id: cusEntsToPlanId({ cusEnts: [customerEntitlement] }),
			reset: cusEntsToReset({ cusEnts: [customerEntitlement] }),
			value: -mutation.balance_delta,
		});
	}

	return [...aggregated.values()];
};

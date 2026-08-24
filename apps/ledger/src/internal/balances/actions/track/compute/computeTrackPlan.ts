import type { MutationLogItem } from "../../../../../api/types/mutationLogItem.js";
import { roundToPrecision } from "../../../../../lib/math/roundToPrecision.js";
import { deductFromCustomerEntitlements } from "../../../deduction/deductFromCustomerEntitlements.js";
import type { SubjectBalance } from "../../../types/subjectBalance.js";
import type { TrackContext } from "../types/trackContext.js";
import type { TrackPlan } from "../types/trackPlan.js";

// `after` is only what the mutations moved: execute writes nothing it did not
// change, and journal consumers recover `before` as `after - delta`.
const mutatedBalances = ({
	mutations,
	balancesAfter,
}: {
	mutations: MutationLogItem[];
	balancesAfter: Record<string, SubjectBalance>;
}): Record<string, SubjectBalance> => {
	const after: Record<string, SubjectBalance> = {};

	for (const mutation of mutations) {
		const customerEntitlementId = mutation.customer_entitlement_id;
		if (!customerEntitlementId) continue;

		const settled = balancesAfter[customerEntitlementId];
		if (settled) after[customerEntitlementId] = settled;
	}

	return after;
};

const sumRemaining = (remainingByFeatureId: Record<string, number>): number => {
	let total = 0;
	for (const remaining of Object.values(remainingByFeatureId)) {
		total += remaining;
	}

	return total;
};

// One kernel call per command: every feature request folds against the same
// balances, in order — the server pays one Redis round-trip per feature for this.
export const computeTrackPlan = ({
	trackContext,
}: {
	trackContext: TrackContext;
}): TrackPlan => {
	const { mutations, balancesAfter, remainingByFeatureId } =
		deductFromCustomerEntitlements({
			customerEntitlements: trackContext.subject.customerEntitlements,
			requests: trackContext.requests,
			options: trackContext.options,
		});

	return {
		mutations,
		after: mutatedBalances({ mutations, balancesAfter }),
		remaining: roundToPrecision(sumRemaining(remainingByFeatureId)),
		remainingByFeatureId,
	};
};

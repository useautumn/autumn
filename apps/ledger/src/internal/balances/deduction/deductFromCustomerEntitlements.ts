import type { FullCusEntWithFullCusProduct } from "@autumn/shared";
import type { MutationLogItem } from "../../../api/types/mutationLogItem.js";
import { roundToPrecision } from "../../../lib/math/roundToPrecision.js";
import type { SubjectBalance } from "../types/subjectBalance.js";
import { bucketChangeToMutation } from "./bucketChangeToMutation.js";
import { calculateBucketChange } from "./calculateBucketChange.js";
import { computeDeductionBuckets } from "./computeDeductionBuckets.js";
import { customerEntitlementsToDeductionRows } from "./customerEntitlementsToDeductionRows.js";
import type { DeductionBucket } from "./types/deductionBucket.js";
import type { DeductionOptions } from "./types/deductionOptions.js";
import type { DeductionRequest } from "./types/deductionRequest.js";
import type { DeductionResult } from "./types/deductionResult.js";

// Row 63: the scratch state every request of one command folds against, so a
// later request sees the numbers an earlier one settled.
const customerEntitlementsToSubjectBalances = ({
	customerEntitlements,
}: {
	customerEntitlements: FullCusEntWithFullCusProduct[];
}): Record<string, SubjectBalance> => {
	const balances: Record<string, SubjectBalance> = {};
	for (const customerEntitlement of customerEntitlements) {
		balances[customerEntitlement.id] = {
			balance: customerEntitlement.balance ?? 0,
			adjustment: customerEntitlement.adjustment ?? 0,
		};
	}

	return balances;
};

// Each bucket takes what its clamp allows, in order; what none of them could
// take is what the request leaves behind.
const applyDeductionBuckets = ({
	balances,
	buckets,
	amount,
	mutations,
}: {
	balances: Record<string, SubjectBalance>;
	buckets: DeductionBucket[];
	amount: number;
	mutations: MutationLogItem[];
}): number => {
	let remaining = amount;

	for (const bucket of buckets) {
		if (remaining === 0) break;

		const balance =
			balances[bucket.customerEntitlementDeduction.customer_entitlement_id];
		if (!balance) continue;

		const creditCost = bucket.customerEntitlementDeduction.credit_cost;
		const change = calculateBucketChange({
			bucket,
			balance,
			amount: remaining * creditCost,
		});
		if (change === 0) continue;

		balance.balance -= change;
		mutations.push(bucketChangeToMutation({ bucket, change }));
		remaining -= change / creditCost;
	}

	return remaining;
};

// The whole balance algorithm: pure over the rows it is handed, no ctx, no
// sqlite, no clock. One command's requests fold in order against one scratch.
export const deductFromCustomerEntitlements = ({
	customerEntitlements,
	requests,
	options,
}: {
	customerEntitlements: FullCusEntWithFullCusProduct[];
	requests: DeductionRequest[];
	options: DeductionOptions;
}): DeductionResult => {
	const balances = customerEntitlementsToSubjectBalances({
		customerEntitlements,
	});
	const mutations: MutationLogItem[] = [];
	const remainingByFeatureId: Record<string, number> = {};

	for (const request of requests) {
		const rows = customerEntitlementsToDeductionRows({
			customerEntitlements,
			request,
		});
		const buckets = computeDeductionBuckets({
			rows,
			amount: request.amount,
			options,
		});
		remainingByFeatureId[request.feature.id] = roundToPrecision(
			applyDeductionBuckets({
				balances,
				buckets,
				amount: request.amount,
				mutations,
			}),
		);
	}

	return { mutations, balancesAfter: balances, remainingByFeatureId };
};

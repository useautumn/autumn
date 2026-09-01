import { Decimal } from "decimal.js";
import type { BalanceMutation } from "../../common/types/balanceMutation.js";
import type { LeanCustomerEntitlement } from "../../common/types/customerState/customerStateTypes.js";
import { calculateBucketChange } from "./calculateBucketChange.js";
import type { DeductionBucket } from "../types/deductionBucket.js";
import type { DeductionResult } from "../types/deductionResult.js";

type ScratchBalance = { balance: Decimal; usage: Decimal };

const createScratch = ({
	customerEntitlements,
}: {
	customerEntitlements: LeanCustomerEntitlement[];
}): Map<string, ScratchBalance> =>
	new Map(
		customerEntitlements.map((customerEntitlement) => [
			customerEntitlement.id,
			{
				balance: new Decimal(customerEntitlement.balance),
				usage: new Decimal(customerEntitlement.usage),
			},
		]),
	);

// Mutations are derived by diffing scratch against the original rows, so two
// buckets touching the same entitlement (included + overflow sink) fold into
// one mutation without a merge special case.
const scratchToMutations = ({
	customerEntitlements,
	scratch,
}: {
	customerEntitlements: LeanCustomerEntitlement[];
	scratch: Map<string, ScratchBalance>;
}): BalanceMutation[] => {
	const mutations: BalanceMutation[] = [];

	for (const customerEntitlement of customerEntitlements) {
		const settled = scratch.get(customerEntitlement.id);
		if (!settled) continue;
		if (
			settled.balance.eq(customerEntitlement.balance) &&
			settled.usage.eq(customerEntitlement.usage)
		) {
			continue;
		}

		mutations.push({
			customerEntitlementId: customerEntitlement.id,
			balanceBefore: customerEntitlement.balance,
			balanceAfter: settled.balance.toNumber(),
			usageBefore: customerEntitlement.usage,
			usageAfter: settled.usage.toNumber(),
		});
	}

	return mutations;
};

// The mechanical fold: each bucket takes what its clamp allows, in order.
// Policy already happened in computeDeductionBuckets.
export const applyDeductionBuckets = ({
	customerEntitlements,
	buckets,
	value,
}: {
	customerEntitlements: LeanCustomerEntitlement[];
	buckets: DeductionBucket[];
	value: Decimal;
}): DeductionResult => {
	const scratch = createScratch({ customerEntitlements });
	let remaining = value;

	for (const bucket of buckets) {
		if (remaining.lte(0)) break;

		const settled = scratch.get(bucket.customerEntitlement.id);
		if (!settled) continue;

		const change = calculateBucketChange({
			bucket,
			balance: settled.balance,
			amount: remaining,
		});
		if (change.lte(0)) continue;

		settled.balance = settled.balance.minus(change);
		settled.usage = settled.usage.plus(change);
		remaining = remaining.minus(change);
	}

	return {
		appliedValue: value.minus(remaining),
		remaining,
		mutations: scratchToMutations({ customerEntitlements, scratch }),
	};
};

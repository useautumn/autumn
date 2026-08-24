import type { MutationLogItem } from "../../../api/types/mutationLogItem.js";
import type { DeductionBucket } from "./types/deductionBucket.js";

// The script's queue_customer_entitlement_mutation: balance moves by -change,
// and adjustment only moves when granted balance is being altered (never here).
export const bucketChangeToMutation = ({
	bucket,
	change,
}: {
	bucket: DeductionBucket;
	change: number;
}): MutationLogItem => ({
	target_type: "customer_entitlement",
	customer_entitlement_id:
		bucket.customerEntitlementDeduction.customer_entitlement_id,
	rollover_id: null,
	entity_id: null,
	credit_cost: bucket.customerEntitlementDeduction.credit_cost,
	balance_delta: -change,
	adjustment_delta: 0,
	usage_delta: 0,
	value_delta: change / bucket.customerEntitlementDeduction.credit_cost,
});

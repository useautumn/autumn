import {
	AllowanceType,
	cusEntToStartingBalance,
	type FullCusEntWithFullCusProduct,
	getMaxOverage,
	notNullish,
} from "@autumn/shared";
import type { CustomerEntitlementDeduction } from "./types/customerEntitlementDeduction.js";
import type { DeductionRequest } from "./types/deductionRequest.js";

// Credit systems are unit 4; every row costs one unit of its own feature.
const CREDIT_COST = 1;

const isUnlimited = (
	customerEntitlement: FullCusEntWithFullCusProduct,
): boolean =>
	customerEntitlement.entitlement.allowance_type === AllowanceType.Unlimited ||
	Boolean(customerEntitlement.unlimited);

// Row 52: unlimited rows are an infinite sink — always usage-allowed, no clamps.
const customerEntitlementToDeductionRow = (
	customerEntitlement: FullCusEntWithFullCusProduct,
): CustomerEntitlementDeduction => {
	const unlimited = isUnlimited(customerEntitlement);
	const maxOverage = getMaxOverage({ cusEnt: customerEntitlement });

	return {
		customer_entitlement_id: customerEntitlement.id,
		feature_id: customerEntitlement.entitlement.feature.id,
		credit_cost: CREDIT_COST,
		usage_allowed: unlimited || Boolean(customerEntitlement.usage_allowed),
		min_balance: unlimited || !notNullish(maxOverage) ? undefined : -maxOverage,
		max_balance: unlimited
			? undefined
			: cusEntToStartingBalance({ cusEnt: customerEntitlement }),
		...(unlimited ? { unlimited: true } : {}),
	};
};

// Row 53: the sort only prefers unlimited within a tier, so hoist the first
// unlimited row to the front — the unlimited bucket depends on it leading.
const hoistUnlimited = (
	rows: CustomerEntitlementDeduction[],
): CustomerEntitlementDeduction[] => {
	const index = rows.findIndex((row) => row.unlimited);
	if (index <= 0) return rows;

	const hoisted = [...rows];
	const [unlimited] = hoisted.splice(index, 1);
	return [unlimited, ...hoisted];
};

// Row 51: the request's own feature decides which rows are its deduction set.
export const customerEntitlementsToDeductionRows = ({
	customerEntitlements,
	request,
}: {
	customerEntitlements: FullCusEntWithFullCusProduct[];
	request: DeductionRequest;
}): CustomerEntitlementDeduction[] => {
	const rows: CustomerEntitlementDeduction[] = [];
	for (const customerEntitlement of customerEntitlements) {
		if (customerEntitlement.entitlement.feature.id !== request.feature.id) {
			continue;
		}
		rows.push(customerEntitlementToDeductionRow(customerEntitlement));
	}

	return hoistUnlimited(rows);
};

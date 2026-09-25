import {
	isPaidCustomerEntitlement,
	isPooledBalanceSourceCustomerEntitlement,
	isSyntheticPooledBalanceCustomerEntitlement,
} from "@autumn/shared";
import { UnsupportedCommandError } from "../../errors.js";
import type { WorkerFullCustomerEntitlementWithProduct } from "../../models/subject/workerFullSubject.js";
import {
	assertBalanceRowsFound,
	assertBalanceRowsMutable,
} from "../common/balanceRowGuards.js";

/** Legacy's refusals, in its order: nothing matched, an invoice credit, then delete's own: a paid grant, either half of a pool. */
export const assertBalancesDeletable = ({
	customerEntitlements,
}: {
	customerEntitlements: WorkerFullCustomerEntitlementWithProduct[];
}): void => {
	assertBalanceRowsFound({ customerEntitlements });
	assertBalanceRowsMutable({ customerEntitlements });
	for (const customerEntitlement of customerEntitlements) {
		if (isPaidCustomerEntitlement(customerEntitlement))
			throw new UnsupportedCommandError({
				reason: "paid_balance_not_deletable",
			});
		// Deleting either half orphans the other: a pool granted for a missing source, or shares pointing at nothing.
		const isPoolHalf =
			isSyntheticPooledBalanceCustomerEntitlement({ customerEntitlement }) ||
			isPooledBalanceSourceCustomerEntitlement({ customerEntitlement });
		if (isPoolHalf)
			throw new UnsupportedCommandError({
				reason: "pooled_balance_not_deletable",
			});
	}
};

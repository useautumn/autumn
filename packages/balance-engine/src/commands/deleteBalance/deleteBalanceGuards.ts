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
		const isPoolHalf =
			isSyntheticPooledBalanceCustomerEntitlement({ customerEntitlement }) ||
			isPooledBalanceSourceCustomerEntitlement({ customerEntitlement });
		if (isPoolHalf)
			throw new UnsupportedCommandError({
				reason: "pooled_balance_not_deletable",
			});
	}
};

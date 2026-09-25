import {
	cusEntToCusPrice,
	isAllocatedCustomerEntitlement,
	isAllocatedPrice,
} from "@autumn/shared";
import type { WorkerFullCustomerEntitlementWithProduct } from "../../models/subject/workerFullSubject.js";
import type { DeductionContext } from "../types/deductionContext.js";
import type { DeductionOutcome } from "../types/deductionOutcome.js";
import type { DeductionState } from "../types/deductionState.js";

export const isRefund = ({
	deductionState,
}: {
	deductionState: DeductionState;
}): boolean => deductionState.remaining.lt(0);

/** "overflow" drops the floors; "cap" and "reject" keep them. */
export const allowsNegative = ({
	context,
}: {
	context: DeductionContext;
}): boolean => context.overageBehavior === "overflow";

/** Legacy's `isUsageBasedAllocatedCustomerEntitlement` over the worker's row: a continuous grant with an in-arrear prorated price. */
const isPaidAllocatedV1CustomerEntitlement = ({
	customerEntitlement,
}: {
	customerEntitlement: WorkerFullCustomerEntitlementWithProduct;
}): boolean => {
	if (!isAllocatedCustomerEntitlement(customerEntitlement)) return false;
	const customerPrice = cusEntToCusPrice({ cusEnt: customerEntitlement });
	return customerPrice ? isAllocatedPrice(customerPrice.price) : false;
};

/** A v1 paid allocated grant invoices on every track, which only Postgres does; the worker refuses so the server defers. v2 bills at cycle end and stays. */
export const isPaidAllocatedV1Deduction = ({
	outcome,
}: {
	outcome: DeductionOutcome;
}): boolean =>
	outcome.context.customerEntitlements.some((customerEntitlement) =>
		isPaidAllocatedV1CustomerEntitlement({ customerEntitlement }),
	);

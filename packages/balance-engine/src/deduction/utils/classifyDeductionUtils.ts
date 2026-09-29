import {
	cusEntToCusPrice,
	isAllocatedCustomerEntitlement,
	isAllocatedPrice,
} from "@autumn/shared";
import type { WorkerFullCustomerEntitlementWithProduct } from "../../models/subject/workerFullSubject.js";
import type { DeductionOutcome } from "../types/deductionOutcome.js";
import type { DeductionSelection } from "../types/deductionRequest.js";
import type { DeductionRow } from "../types/deductionRow.js";
import type { DeductionState } from "../types/deductionState.js";

export const isRefund = ({
	deductionState,
}: {
	deductionState: DeductionState;
}): boolean => deductionState.remaining.lt(0);

/** "overflow" drops the floors; "cap" and "reject" keep them. */
export const allowsNegative = ({
	deductionState,
}: {
	deductionState: DeductionState;
}): boolean => deductionState.terms.overageBehavior === "overflow";

/** Whether this draw may take the row below zero: its own overage, or a free allocated grant's unless the draw rejects. */
export const isUsageAllowed = ({
	row,
	deductionState,
}: {
	row: DeductionRow;
	deductionState: DeductionState;
}): boolean =>
	row.usageAllowed ||
	(row.freeAllocated && deductionState.terms.overageBehavior !== "reject");

const sameJson = (left: unknown, right: unknown): boolean =>
	left === right || JSON.stringify(left) === JSON.stringify(right);

/** Two selections that would find the same rows, read the same way: a context set up for one serves the other. */
export const isSameSelection = ({
	left,
	right,
}: {
	left: DeductionSelection;
	right: DeductionSelection;
}): boolean =>
	left.featureId === right.featureId &&
	left.internalFeatureId === right.internalFeatureId &&
	left.now === right.now &&
	left.includesCreditSystems === right.includesCreditSystems &&
	left.countsUsageWindows === right.countsUsageWindows &&
	left.reverseOrder === right.reverseOrder &&
	left.blocksOverdue === right.blocksOverdue &&
	sameJson(left.inStatuses, right.inStatuses) &&
	sameJson(left.properties, right.properties) &&
	sameJson(left.customerEntitlementFilters, right.customerEntitlementFilters);

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

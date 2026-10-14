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

export const isFreeRow = ({ row }: { row: DeductionRow }): boolean =>
	row.rateCard === null && row.creditCost === 0;

export const allowsNegative = ({
	deductionState,
}: {
	deductionState: DeductionState;
}): boolean => deductionState.terms.overageBehavior === "overflow";

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
	left.countsAllocations === right.countsAllocations &&
	left.reverseOrder === right.reverseOrder &&
	left.blocksOverdue === right.blocksOverdue &&
	sameJson(left.inStatuses, right.inStatuses) &&
	sameJson(left.properties, right.properties) &&
	sameJson(left.customerEntitlementFilters, right.customerEntitlementFilters);

const isPaidAllocatedV1CustomerEntitlement = ({
	customerEntitlement,
}: {
	customerEntitlement: WorkerFullCustomerEntitlementWithProduct;
}): boolean => {
	if (!isAllocatedCustomerEntitlement(customerEntitlement)) return false;
	const customerPrice = cusEntToCusPrice({ cusEnt: customerEntitlement });
	return customerPrice ? isAllocatedPrice(customerPrice.price) : false;
};

export const isPaidAllocatedV1Deduction = ({
	outcome,
}: {
	outcome: DeductionOutcome;
}): boolean =>
	outcome.context.customerEntitlements.some((customerEntitlement) =>
		isPaidAllocatedV1CustomerEntitlement({ customerEntitlement }),
	);

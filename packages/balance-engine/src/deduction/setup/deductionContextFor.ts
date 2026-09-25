import type { WorkerFullSubject } from "../../models/subject/workerFullSubject.js";
import type { DeductionContext } from "../types/deductionContext.js";
import type { DeductionOutcome } from "../types/deductionOutcome.js";
import type { DeductionRequest } from "../types/deductionRequest.js";
import { isFreeAllocatedRow } from "./resolveRowBounds.js";
import { isOverdueBlocked } from "./selectDeductionRows.js";
import { setupDeductionContext } from "./setupDeductionContext.js";

/** Setup reads the feature, the event, the clock, the org and the row rules from a request; two requests that share them share rows. */
const sharesSetupInputs = ({
	left,
	right,
}: {
	left: DeductionRequest;
	right: DeductionRequest;
}): boolean =>
	left.featureId === right.featureId &&
	left.internalFeatureId === right.internalFeatureId &&
	left.properties === right.properties &&
	left.now === right.now &&
	left.org === right.org &&
	left.includesCreditSystems === right.includesCreditSystems &&
	left.enforcesSpendLimit === right.enforcesSpendLimit &&
	left.countsUsageWindows === right.countsUsageWindows &&
	left.customerEntitlementFilters === right.customerEntitlementFilters;

/** Whether the overdue rule shuts out the same products for both requests. */
const blocksSameProducts = ({
	fullSubject,
	left,
	right,
}: {
	fullSubject: WorkerFullSubject;
	left: DeductionRequest;
	right: DeductionRequest;
}): boolean =>
	fullSubject.customer_products.every(
		(customerProduct) =>
			isOverdueBlocked({ customerProduct, request: left }) ===
			isOverdueBlocked({ customerProduct, request: right }),
	);

/** Whether every row is bounded the same way for both requests: only a free allocated row follows the overage behaviour. */
const boundsRowsTheSame = ({
	context,
	left,
	right,
}: {
	context: DeductionContext;
	left: DeductionRequest;
	right: DeductionRequest;
}): boolean =>
	left.overageBehavior === right.overageBehavior ||
	!context.customerEntitlements.some((customerEntitlement) =>
		isFreeAllocatedRow({ customerEntitlement }),
	);

/** The context `request` would set up on the subject: the one an earlier deduction already set up, when it would come out the same. */
export const deductionContextFor = ({
	fullSubject,
	request,
	reusing,
}: {
	fullSubject: WorkerFullSubject;
	request: DeductionRequest;
	reusing: DeductionOutcome;
}): DeductionContext => {
	const { context } = reusing;
	const setsUpTheSame =
		sharesSetupInputs({ left: reusing.request, right: request }) &&
		blocksSameProducts({
			fullSubject,
			left: reusing.request,
			right: request,
		}) &&
		boundsRowsTheSame({ context, left: reusing.request, right: request });
	if (!setsUpTheSame) return setupDeductionContext({ fullSubject, request });
	return { ...context, overageBehavior: request.overageBehavior };
};

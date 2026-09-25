import {
	CusProductStatus,
	fullSubjectToCustomerEntitlements,
	isThresholdBillingCustomerProduct,
	isUnlimitedCustomerEntitlement,
	orgToInStatuses,
} from "@autumn/shared";
import type { WorkerRollover } from "../../models/subject/rows/workerRollover.js";
import type {
	WorkerFullCustomerEntitlementWithProduct,
	WorkerFullCustomerProduct,
	WorkerFullSubject,
} from "../../models/subject/workerFullSubject.js";
import type { DeductionRequest } from "../types/deductionRequest.js";

/** The sort prefers unlimited only within a tier; the sink contract needs it first outright. */
const hoistUnlimited = ({
	customerEntitlements,
}: {
	customerEntitlements: WorkerFullCustomerEntitlementWithProduct[];
}): WorkerFullCustomerEntitlementWithProduct[] => {
	const unlimited = customerEntitlements.find((customerEntitlement) =>
		isUnlimitedCustomerEntitlement({ customerEntitlement }),
	);
	if (!unlimited) return customerEntitlements;
	return [
		unlimited,
		...customerEntitlements.filter((candidate) => candidate !== unlimited),
	];
};

/** Soonest-expiring first; rollovers without an expiry drain last. */
const byExpiresAt = (left: WorkerRollover, right: WorkerRollover): number =>
	(left.expires_at ?? Number.POSITIVE_INFINITY) -
	(right.expires_at ?? Number.POSITIVE_INFINITY);

/** `getCheckSubject`: a past-due product stops funding when the org blocks overdue usage on a check, or when it bills by threshold. */
export const isOverdueBlocked = ({
	customerProduct,
	request,
}: {
	customerProduct: WorkerFullCustomerProduct;
	request: Pick<DeductionRequest, "enforceOverdueBlock" | "org">;
}): boolean =>
	customerProduct.status === CusProductStatus.PastDue &&
	!customerProduct.product.config?.ignore_past_due &&
	((request.enforceOverdueBlock &&
		request.org.config.block_overdue_entitlements) ||
		isThresholdBillingCustomerProduct({ customerProduct }));

/** Which rows fund the feature, in draw order, and their rollovers: the same selection and sort the Lua path uses. */
export const selectDeductionRows = ({
	fullSubject,
	request,
}: {
	fullSubject: WorkerFullSubject;
	request: DeductionRequest;
}): {
	customerEntitlements: WorkerFullCustomerEntitlementWithProduct[];
	rollovers: WorkerRollover[];
	overdueBlocked: boolean;
} => {
	const blockedProducts = fullSubject.customer_products.filter(
		(customerProduct) => isOverdueBlocked({ customerProduct, request }),
	);
	const fundingSubject = {
		...fullSubject,
		customer_products: fullSubject.customer_products.filter(
			(customerProduct) => !blockedProducts.includes(customerProduct),
		),
	};
	const customerEntitlements = hoistUnlimited({
		customerEntitlements: fullSubjectToCustomerEntitlements({
			fullSubject: fundingSubject,
			fundsFeatureId: request.featureId,
			inStatuses: orgToInStatuses({ org: request.org }),
			reverseOrder: request.org.config.reverse_deduction_order,
			now: request.now,
		}),
	});
	// State outlives a rollover's expiry; the hydration query drops these, the draw must too.
	const rollovers = customerEntitlements
		.flatMap((customerEntitlement) => customerEntitlement.rollovers)
		.filter(
			(rollover) =>
				rollover.expires_at === null || rollover.expires_at > request.now,
		)
		.sort(byExpiresAt);
	const overdueBlocked = blockedProducts.some((customerProduct) =>
		customerProduct.customer_entitlements.some(
			(customerEntitlement) =>
				customerEntitlement.entitlement.feature.id === request.featureId,
		),
	);
	return { customerEntitlements, rollovers, overdueBlocked };
};

import {
	CusProductStatus,
	fullSubjectToCustomerEntitlements,
	isThresholdBillingCustomerProduct,
	isUnlimitedCustomerEntitlement,
} from "@autumn/shared";
import type { WorkerRollover } from "../../models/subject/rows/workerRollover.js";
import type {
	WorkerFullCustomerEntitlementWithProduct,
	WorkerFullCustomerProduct,
	WorkerFullSubject,
} from "../../models/subject/workerFullSubject.js";
import type { DeductionSelection } from "../types/deductionRequest.js";

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

/** `getCheckSubject`: a past-due product stops funding when the selection blocks overdue usage, or when it bills by threshold. */
const isOverdueBlocked = ({
	customerProduct,
	selection,
}: {
	customerProduct: WorkerFullCustomerProduct;
	selection: DeductionSelection;
}): boolean =>
	customerProduct.status === CusProductStatus.PastDue &&
	!customerProduct.product.config?.ignore_past_due &&
	(selection.blocksOverdue ||
		isThresholdBillingCustomerProduct({ customerProduct }));

/** Which rows the selection draws from, in draw order, and their rollovers: the same selection and sort the Lua path uses. */
export const selectDeductionRows = ({
	fullSubject,
	selection,
}: {
	fullSubject: WorkerFullSubject;
	selection: DeductionSelection;
}): {
	customerEntitlements: WorkerFullCustomerEntitlementWithProduct[];
	rollovers: WorkerRollover[];
	overdueBlocked: boolean;
} => {
	const blockedProducts = fullSubject.customer_products.filter(
		(customerProduct) => isOverdueBlocked({ customerProduct, selection }),
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
			...(selection.includesCreditSystems
				? { fundsFeatureId: selection.featureId }
				: { featureIds: [selection.featureId] }),
			customerEntitlementFilters: selection.customerEntitlementFilters,
			inStatuses: selection.inStatuses,
			reverseOrder: selection.reverseOrder,
			now: selection.now,
		}),
	});
	// State outlives a rollover's expiry; the hydration query drops these, the draw must too.
	const rollovers = customerEntitlements
		.flatMap((customerEntitlement) => customerEntitlement.rollovers)
		.filter(
			(rollover) =>
				rollover.expires_at === null || rollover.expires_at > selection.now,
		)
		.sort(byExpiresAt);
	const overdueBlocked = blockedProducts.some((customerProduct) =>
		customerProduct.customer_entitlements.some(
			(customerEntitlement) =>
				customerEntitlement.entitlement.feature.id === selection.featureId,
		),
	);
	return { customerEntitlements, rollovers, overdueBlocked };
};

import {
	type DbOverageAllowed,
	fullSubjectToOverageAllowedByFeatureId,
	fullSubjectToSpendLimitByFeatureId,
} from "@autumn/shared";
import type {
	WorkerFullCustomerEntitlementWithProduct,
	WorkerFullSubject,
} from "../../models/subject/workerFullSubject.js";

export type BillingControls = {
	/** Absolute overage each feature may carry; percentage limits already resolved against the main plans' grant. */
	spendLimitByFeatureId: Record<string, number>;
	overageAllowedByFeatureId: Record<string, DbOverageAllowed>;
};

/** The same resolution the Redis path runs, over the tracked feature and every feature that funds it. */
export const resolveBillingControls = ({
	fullSubject,
	featureId,
	customerEntitlements,
}: {
	fullSubject: WorkerFullSubject;
	featureId: string;
	customerEntitlements: WorkerFullCustomerEntitlementWithProduct[];
}): BillingControls => {
	const featureIds = [
		...new Set([
			featureId,
			...customerEntitlements.map(
				(customerEntitlement) => customerEntitlement.entitlement.feature.id,
			),
		]),
	];
	const spendLimits = fullSubjectToSpendLimitByFeatureId({
		fullSubject,
		featureIds,
	});
	return {
		spendLimitByFeatureId: Object.fromEntries(
			Object.entries(spendLimits).flatMap(([id, limit]) =>
				limit.overage_limit === undefined ? [] : [[id, limit.overage_limit]],
			),
		),
		overageAllowedByFeatureId: fullSubjectToOverageAllowedByFeatureId({
			fullSubject,
			featureIds,
		}),
	};
};

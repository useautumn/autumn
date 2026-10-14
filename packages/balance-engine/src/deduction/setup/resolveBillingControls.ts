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
	spendLimitByFeatureId: Record<string, number>;
	overageAllowedByFeatureId: Record<string, DbOverageAllowed>;
};

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

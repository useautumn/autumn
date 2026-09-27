import type { DbOverageAllowed } from "../../models/cusModels/billingControls/customerBillingControls.js";
import type {
	BillingControlSubjectView,
	CustomerEntitlementRowView,
	CustomerProductWithPricesView,
} from "../../models/cusProductModels/cusEntModels/fullCustomerEntitlementView.js";
import {
	fullSubjectToPlanProducts,
	type PlanControlCustomerProduct,
	resolveBillingControl,
} from "./planBillingControlUtils.js";

/**
 * Extract overage_allowed entries for the requested features from a FullSubject.
 *
 * Entity inherits from the customer per feature_id: entity's entry wins when
 * present, customer's entry fills any gaps.
 */
export const fullSubjectToOverageAllowedByFeatureId = <
	CE extends CustomerEntitlementRowView,
	CP extends PlanControlCustomerProduct & CustomerProductWithPricesView,
>({
	fullSubject,
	featureIds,
}: {
	fullSubject: BillingControlSubjectView<CE, CP>;
	featureIds: string[];
}): Record<string, DbOverageAllowed> => {
	const entityOverageAllowed = fullSubject.entity?.overage_allowed ?? [];
	const customerOverageAllowed = fullSubject.customer.overage_allowed ?? [];
	const overageAllowedByFeatureId: Record<string, DbOverageAllowed> = {};
	const uniqueFeatureIds = [...new Set(featureIds)];

	for (const featureId of uniqueFeatureIds) {
		const overageAllowed = resolveBillingControl({
			controlLists: [entityOverageAllowed, customerOverageAllowed],
			customerProducts: fullSubjectToPlanProducts({ fullSubject }),
			controlKey: "overage_allowed",
			matches: (candidate) => candidate.feature_id === featureId,
		});

		if (overageAllowed) {
			overageAllowedByFeatureId[featureId] = overageAllowed;
		}
	}

	return overageAllowedByFeatureId;
};

import type { DbSpendLimit } from "../../models/cusModels/billingControls/customerBillingControls.js";
import type { FullSubject } from "../../models/cusModels/fullSubject/fullSubjectModel.js";
import { resolveSpendLimitOverageLimit } from "../cusEntUtils/convertCusEntUtils/resolveSpendLimitOverageLimit.js";
import { fullSubjectToCustomerEntitlements } from "./fullSubjectToCustomerEntitlements.js";
import { DEFAULT_PLAN_CONTROL_STATUSES } from "./planBillingControlUtils.js";

/**
 * Comparison projection that resolves usage_percentage spend limits to
 * absolute units, so most-restrictive picks across plans compare like for
 * like. Shared by check, track webhooks, and customer reads.
 */
export const buildNormalizeSpendLimitForCompare = ({
	fullSubject,
	entityId,
}: {
	fullSubject: FullSubject;
	entityId?: string;
}): ((control: DbSpendLimit) => DbSpendLimit) => {
	const cusEntsForFeature = (featureId: string) =>
		fullSubjectToCustomerEntitlements({
			fullSubject,
			featureIds: [featureId],
			inStatuses: DEFAULT_PLAN_CONTROL_STATUSES,
		});
	const additionalAllowanceForFeature = (featureId: string) =>
		fullSubject.aggregated_customer_entitlements?.find(
			(entitlement) => entitlement.feature_id === featureId,
		)?.allowance_total ?? 0;

	return (control: DbSpendLimit): DbSpendLimit => {
		if (control.limit_type !== "usage_percentage" || !control.feature_id) {
			return control;
		}
		return {
			...control,
			overage_limit: resolveSpendLimitOverageLimit({
				spendLimit: control,
				cusEnts: cusEntsForFeature(control.feature_id),
				entityId,
				additionalAllowance: additionalAllowanceForFeature(control.feature_id),
			}),
			limit_type: "absolute",
		};
	};
};

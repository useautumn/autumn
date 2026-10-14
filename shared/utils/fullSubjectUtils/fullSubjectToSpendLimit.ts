import type { DbSpendLimit } from "../../models/cusModels/billingControls/customerBillingControls.js";
import type {
	BillingControlSubjectView,
	CustomerEntitlementRowView,
	CustomerProductWithPricesView,
} from "../../models/cusProductModels/cusEntModels/fullCustomerEntitlementView.js";
import { resolveSpendLimitOverageLimit } from "../cusEntUtils/index.js";
import { fullSubjectToCustomerEntitlements } from "./fullSubjectToCustomerEntitlements.js";
import {
	DEFAULT_PLAN_CONTROL_STATUSES,
	fullSubjectToPlanProducts,
	type PlanControlCustomerProduct,
	resolveBillingControl,
} from "./planBillingControlUtils.js";

export const fullSubjectToSpendLimitByFeatureId = <
	CE extends CustomerEntitlementRowView,
	CP extends PlanControlCustomerProduct & CustomerProductWithPricesView,
>({
	fullSubject,
	featureIds,
}: {
	fullSubject: BillingControlSubjectView<CE, CP>;
	featureIds: string[];
}): Record<string, DbSpendLimit> => {
	const entitySpendLimits = fullSubject.entity?.spend_limits ?? [];
	const customerSpendLimits = fullSubject.customer.spend_limits ?? [];
	const spendLimitByFeatureId: Record<string, DbSpendLimit> = {};
	const uniqueFeatureIds = [...new Set(featureIds)];

	for (const featureId of uniqueFeatureIds) {
		const isMatch = (candidate: DbSpendLimit) =>
			candidate.feature_id === featureId &&
			candidate.overage_limit !== undefined;

		const cusEnts = fullSubjectToCustomerEntitlements({
			fullSubject,
			featureIds: [featureId],
			inStatuses: DEFAULT_PLAN_CONTROL_STATUSES,
		});
		const entityId = fullSubject.entity?.id ?? undefined;
		const additionalAllowance =
			fullSubject.aggregated_customer_entitlements?.find(
				(entitlement) => entitlement.feature_id === featureId,
			)?.allowance_total ?? 0;
		const normalizeForCompare = (control: DbSpendLimit): DbSpendLimit => {
			if (control.limit_type !== "usage_percentage") return control;
			return {
				...control,
				overage_limit: resolveSpendLimitOverageLimit({
					spendLimit: control,
					cusEnts,
					entityId,
					additionalAllowance,
				}),
				limit_type: "absolute",
			};
		};

		const spendLimit = resolveBillingControl({
			controlLists: [entitySpendLimits, customerSpendLimits],
			customerProducts: fullSubjectToPlanProducts({ fullSubject }),
			controlKey: "spend_limits",
			matches: isMatch,
			normalizeForCompare,
		});

		if (spendLimit?.enabled) {
			const resolved = resolveSpendLimitOverageLimit({
				spendLimit,
				cusEnts,
				entityId,
				additionalAllowance,
			});

			if (resolved !== undefined) {
				spendLimitByFeatureId[featureId] = {
					...spendLimit,
					overage_limit: resolved,
					limit_type: "absolute",
				};
			}
		}
	}

	return spendLimitByFeatureId;
};

export const fullSubjectToUsageBasedCusEntsByFeatureId = <
	CE extends CustomerEntitlementRowView,
	CP extends PlanControlCustomerProduct & CustomerProductWithPricesView,
>({
	fullSubject,
	featureIds,
}: {
	fullSubject: BillingControlSubjectView<CE, CP>;
	featureIds: string[];
}): Record<string, string[]> => {
	const customerEntitlements = fullSubjectToCustomerEntitlements({
		fullSubject,
		featureIds,
	});
	const overageCusEntsByFeatureId: Record<string, string[]> = {};

	for (const customerEntitlement of customerEntitlements) {
		const featureId = customerEntitlement.entitlement.feature.id;
		if (!overageCusEntsByFeatureId[featureId]) {
			overageCusEntsByFeatureId[featureId] = [];
		}
		overageCusEntsByFeatureId[featureId].push(customerEntitlement.id);
	}

	return overageCusEntsByFeatureId;
};

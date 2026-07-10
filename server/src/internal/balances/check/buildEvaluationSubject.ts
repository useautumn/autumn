import {
	type ApiCustomerV5,
	type ApiEntityV2,
	buildNormalizeSpendLimitForCompare,
	DEFAULT_PLAN_CONTROL_STATUSES,
	type FullSubject,
	fullSubjectToCustomerEntitlements,
	mergeCustomerBillingControlsForCheck,
	mergePlanBillingControlsForCheck,
} from "@autumn/shared";
import type { RequestContext } from "@/honoUtils/HonoEnv.js";
import { getApiCustomerBaseV2 } from "@/internal/customers/cusUtils/getApiCustomerV2/getApiCustomerBaseV2.js";
import { getApiSubject } from "@/internal/customers/cusUtils/getApiCustomerV2/getApiSubject.js";
import { resolveCheckSpendLimits } from "./resolveCheckSpendLimits.js";

/**
 * Evaluation subject for apiBalanceToAllowed, with plan-level (and, for
 * entities, customer-level) billing controls merged in and percentage spend
 * limits resolved to absolute. Shared by /v1/check and the track webhooks so
 * both gate on identical limits.
 */
export const buildEvaluationSubject = async ({
	ctx,
	fullSubject,
	entityId,
}: {
	ctx: RequestContext;
	fullSubject: FullSubject;
	entityId?: string;
}): Promise<ApiCustomerV5 | ApiEntityV2> => {
	let evaluationApiSubject = await getApiSubject({
		ctx,
		fullSubject,
		includeAggregations: false,
	});

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
	const normalizeSpendLimitForCompare = buildNormalizeSpendLimitForCompare({
		fullSubject,
		entityId,
	});

	if (fullSubject.subjectType === "entity") {
		const { apiCustomer } = await getApiCustomerBaseV2({
			ctx,
			fullSubject: {
				...fullSubject,
				aggregated_customer_products: undefined,
				aggregated_customer_entitlements: undefined,
				aggregated_subject_flags: undefined,
			},
			withAutumnId: true,
		});
		evaluationApiSubject = mergeCustomerBillingControlsForCheck({
			entityApiSubject: evaluationApiSubject as ApiEntityV2,
			customerApiSubject: apiCustomer,
			planCustomerProducts: fullSubject.customer_products,
			normalizeSpendLimitForCompare,
			fullSubject,
			features: ctx.features,
		});
	} else {
		evaluationApiSubject = mergePlanBillingControlsForCheck({
			customerApiSubject: evaluationApiSubject as ApiCustomerV5,
			planCustomerProducts: fullSubject.customer_products,
			normalizeSpendLimitForCompare,
			fullSubject,
			features: ctx.features,
		});
	}

	return resolveCheckSpendLimits({
		subject: evaluationApiSubject,
		cusEntsForFeature,
		entityId,
		additionalAllowanceForFeature,
	});
};

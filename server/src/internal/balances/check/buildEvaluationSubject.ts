import {
	type ApiCustomerV5,
	type ApiEntityV2,
	type DbSpendLimit,
	DEFAULT_PLAN_CONTROL_STATUSES,
	type FullSubject,
	fullSubjectToCustomerEntitlements,
	mergeCustomerBillingControlsForCheck,
	mergePlanBillingControlsForCheck,
	resolveSpendLimitOverageLimit,
} from "@autumn/shared";
import type { RequestContext } from "@/honoUtils/HonoEnv.js";
import { getApiCustomerBaseV2 } from "@/internal/customers/cusUtils/getApiCustomerV2/getApiCustomerBaseV2.js";
import { getApiSubject } from "@/internal/customers/cusUtils/getApiCustomerV2/getApiSubject.js";
import { resolveCheckSpendLimits } from "./resolveCheckSpendLimits.js";

/**
 * Build the api subject used to evaluate `allowed` (via apiBalanceToAllowed),
 * with plan-level and (for entities) customer-level billing controls merged in
 * and percentage spend limits resolved to absolute.
 *
 * This is the single source of truth for "what limits gate this subject",
 * shared by the /v1/check path (getCheckDataV2) and the track webhooks
 * (checkLimitReached). Both must see identical billing controls, or a plan-level
 * / percentage cap that blocks a track would fail to fire balances.limit_reached.
 *
 * Pure with respect to inputs (returns a new subject); does no aggregation
 * (evaluation subject only), matching getApiSubject includeAggregations: false.
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
	const normalizeSpendLimitForCompare = (
		control: DbSpendLimit,
	): DbSpendLimit => {
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

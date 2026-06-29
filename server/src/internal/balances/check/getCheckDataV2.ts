import {
	type ApiCustomerV5,
	type ApiEntityV2,
	ApiVersion,
	type CheckParams,
	type DbSpendLimit,
	DEFAULT_PLAN_CONTROL_STATUSES,
	type Feature,
	FeatureNotFoundError,
	findFeatureById,
	fullSubjectToCustomerEntitlements,
	fullSubjectToFullCustomer,
	getFeatureToUseForCheck,
	mergeCustomerBillingControlsForCheck,
	mergePlanBillingControlsForCheck,
	resolveSpendLimitOverageLimit,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import {
	getOrCreateCachedPartialFullSubject,
	getOrSetCachedPartialFullSubject,
} from "@/internal/customers/cache/fullSubject/index.js";
import { getApiCustomerBaseV2 } from "@/internal/customers/cusUtils/getApiCustomerV2/getApiCustomerBaseV2.js";
import { getApiSubject } from "@/internal/customers/cusUtils/getApiCustomerV2/getApiSubject.js";
import { getCreditSystemsFromFeature } from "@/internal/features/creditSystemUtils.js";
import { triggerAutoTopUp } from "../autoTopUp/triggerAutoTopUp.js";
import type { CheckDataV2 } from "./checkTypes/CheckDataV2.js";
import { resolveCheckSpendLimits } from "./resolveCheckSpendLimits.js";

const getFeatureAndCreditSystems = ({
	features,
	featureId,
}: {
	features: Feature[];
	featureId: string;
}) => {
	const feature = features.find((candidate) => candidate.id === featureId);
	const creditSystems = getCreditSystemsFromFeature({
		featureId,
		features,
	});

	return { feature, creditSystems };
};

export const getCheckDataV2 = async ({
	ctx,
	body,
	requiredBalance,
}: {
	ctx: AutumnContext;
	body: CheckParams & { feature_id: string };
	requiredBalance: number;
}): Promise<CheckDataV2> => {
	const { customer_id, feature_id, entity_id } = body;

	const { feature, creditSystems } = getFeatureAndCreditSystems({
		features: ctx.features,
		featureId: feature_id,
	});

	if (!feature) {
		throw new FeatureNotFoundError({ featureId: feature_id });
	}

	const featureIds = Array.from(
		new Set([
			feature_id,
			...creditSystems.map((creditSystem) => creditSystem.id),
		]),
	);

	const fullSubject = ctx.apiVersion.gte(ApiVersion.V2_1)
		? await getOrSetCachedPartialFullSubject({
				ctx,
				customerId: customer_id,
				entityId: entity_id,
				featureIds,
				source: "getCheckDataV2",
			})
		: await getOrCreateCachedPartialFullSubject({
				ctx,
				params: body,
				featureIds,
				source: "getCheckDataV2",
			});

	const apiSubject = await getApiSubject({
		ctx,
		fullSubject,
		includeAggregations: true,
	});
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
				entityId: entity_id,
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
		});
	} else {
		evaluationApiSubject = mergePlanBillingControlsForCheck({
			customerApiSubject: evaluationApiSubject as ApiCustomerV5,
			planCustomerProducts: fullSubject.customer_products,
			normalizeSpendLimitForCompare,
		});
	}

	evaluationApiSubject = resolveCheckSpendLimits({
		subject: evaluationApiSubject,
		cusEntsForFeature: (featureId) =>
			fullSubjectToCustomerEntitlements({
				fullSubject,
				featureIds: [featureId],
				inStatuses: DEFAULT_PLAN_CONTROL_STATUSES,
			}),
		entityId: entity_id,
		additionalAllowanceForFeature,
	});

	const featureToUseMin = getFeatureToUseForCheck({
		creditSystems,
		feature,
		apiSubject: evaluationApiSubject,
		requiredBalance,
	});

	const featureToUse = findFeatureById({
		features: ctx.features,
		featureId: featureToUseMin.id,
		errorOnNotFound: true,
	});

	// Trigger auto top-up
	triggerAutoTopUp({
		ctx,
		newFullCus: fullSubjectToFullCustomer({ fullSubject }),
		feature: featureToUse,
	}).catch((error) => {
		ctx.logger.error(`[getCheckData] Failed to trigger auto top-up: ${error}`);
	});

	return {
		customerId: customer_id,
		entityId: entity_id,
		apiBalance: apiSubject.balances?.[featureToUse.id],
		apiFlag: apiSubject.flags?.[featureToUse.id],
		apiSubject,
		originalFeature: feature,
		featureToUse,
		fullSubject,
		evaluationApiSubject,
		evaluationApiBalance: evaluationApiSubject.balances?.[featureToUse.id],
		evaluationApiFlag: evaluationApiSubject.flags?.[featureToUse.id],
	};
};

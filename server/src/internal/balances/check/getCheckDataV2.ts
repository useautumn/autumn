import {
	ApiVersion,
	type CheckParams,
	type Feature,
	FeatureNotFoundError,
	findFeatureById,
	fullSubjectToFullCustomer,
	getFeatureToUseForCheck,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import {
	getOrCreateCachedPartialFullSubject,
	getOrSetCachedPartialFullSubject,
} from "@/internal/customers/cache/fullSubject/index.js";
import { getApiSubject } from "@/internal/customers/cusUtils/getApiCustomerV2/getApiSubject.js";
import { getCreditSystemsFromFeature } from "@/internal/features/creditSystemUtils.js";
import { withTimeout } from "@/utils/withTimeout.js";
import { triggerAutoTopUp } from "../autoTopUp/triggerAutoTopUp.js";
import { buildEvaluationSubject } from "./buildEvaluationSubject.js";
import type { CheckDataV2 } from "./checkTypes/CheckDataV2.js";

/** Deadline for check's cache-miss DB hydration — check's ~50ms latency SLO can't wait out the 15s pool clocks. */
export const CHECK_DB_HYDRATION_BUDGET_MS = 2_000;

export const withCheckDbHydrationBudget = <T>(fn: () => Promise<T>) =>
	withTimeout({
		timeoutMs: CHECK_DB_HYDRATION_BUDGET_MS,
		timeoutMessage: "Query read timeout",
		fn,
	});

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

	// "Query read timeout" is in TRANSIENT_DB_ERROR_MESSAGES, so isTransientDbError
	// classifies the expiry as transient and check's withRedisFailOpen fallback engages.
	const fullSubject = await withCheckDbHydrationBudget(
		() =>
			ctx.apiVersion.gte(ApiVersion.V2_1)
				? getOrSetCachedPartialFullSubject({
						ctx,
						customerId: customer_id,
						entityId: entity_id,
						featureIds,
						source: "getCheckDataV2",
					})
				: getOrCreateCachedPartialFullSubject({
						ctx,
						params: body,
						featureIds,
						source: "getCheckDataV2",
					}),
	);

	const apiSubject = await getApiSubject({
		ctx,
		fullSubject,
		includeAggregations: true,
	});
	const evaluationApiSubject = await buildEvaluationSubject({
		ctx,
		fullSubject,
		entityId: entity_id,
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

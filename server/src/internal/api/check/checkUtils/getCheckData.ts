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
	fullCustomerToCustomerEntitlements,
	getFeatureToUseForCheck,
	InternalError,
	mergeCustomerBillingControlsForCheck,
	mergePlanBillingControlsForCheck,
	resolveSpendLimitOverageLimit,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { triggerAutoTopUp } from "@/internal/balances/autoTopUp/triggerAutoTopUp.js";
import { resolveCheckSpendLimits } from "@/internal/balances/check/resolveCheckSpendLimits.js";
import { getApiCustomerBase } from "@/internal/customers/cusUtils/apiCusUtils/getApiCustomerBase.js";
import { getOrCreateCachedFullCustomer } from "@/internal/customers/cusUtils/fullCustomerCacheUtils/getOrCreateCachedFullCustomer.js";
import { getOrSetCachedFullCustomer } from "@/internal/customers/cusUtils/fullCustomerCacheUtils/getOrSetCachedFullCustomer.js";
import {
	getOrCreateCachedPartialFullSubject,
	getOrSetCachedPartialFullSubject,
} from "@/internal/customers/cache/fullSubject/index.js";
import { getApiEntityBase } from "@/internal/entities/entityUtils/apiEntityUtils/getApiEntityBase.js";
import { getCreditSystemsFromFeature } from "@/internal/features/creditSystemUtils.js";
import type { CheckData } from "../checkTypes/CheckData.js";

// Main functions
const getFeatureAndCreditSystems = ({
	features,
	featureId,
}: {
	features: Feature[];
	featureId: string;
}) => {
	const feature: Feature | undefined = features.find(
		(feature: Feature) => feature.id === featureId,
	);

	const creditSystems = getCreditSystemsFromFeature({
		featureId,
		features,
	});

	return { feature, creditSystems, allFeatures: features };
};

export const getCheckData = async ({
	ctx,
	body,
	requiredBalance,
}: {
	ctx: AutumnContext;
	body: CheckParams & { feature_id: string };
	requiredBalance: number;
}): Promise<CheckData> => {
	const { customer_id, feature_id, entity_id } = body;

	const { feature, creditSystems } = getFeatureAndCreditSystems({
		features: ctx.features,
		featureId: feature_id,
	});

	if (!feature) {
		throw new FeatureNotFoundError({ featureId: feature_id });
	}
	const featureIds = Array.from(
		new Set([feature_id, ...creditSystems.map((creditSystem) => creditSystem.id)]),
	);

	let apiSubject: ApiCustomerV5 | ApiEntityV2 | undefined;
	const start = performance.now();
	const fullCustomer = ctx.apiVersion.gte(ApiVersion.V2_1)
		? await getOrSetCachedFullCustomer({
				ctx,
				customerId: customer_id,
				entityId: entity_id,
				source: "getCheckData",
			})
		: await getOrCreateCachedFullCustomer({
				ctx,
				params: body,
				source: "getCheckData",
			});
	const { apiCustomer } = await getApiCustomerBase({
		ctx,
		fullCus: fullCustomer,
		withAutumnId: true,
	});
	ctx.logger.debug(
		`[check] getOrCreateCachedFullCustomer took ${performance.now() - start}ms`,
	);

	apiSubject = apiCustomer;
	const fullSubjectForAggregates = !entity_id
		? ctx.apiVersion.gte(ApiVersion.V2_1)
			? await getOrSetCachedPartialFullSubject({
					ctx,
					customerId: customer_id,
					featureIds,
					source: "getCheckData",
				})
			: await getOrCreateCachedPartialFullSubject({
					ctx,
					params: body,
					featureIds,
					source: "getCheckData",
				})
		: undefined;
	const additionalAllowanceForFeature = (featureId: string) =>
		fullSubjectForAggregates?.aggregated_customer_entitlements?.find(
			(entitlement) => entitlement.feature_id === featureId,
		)?.allowance_total ?? 0;
	const cusEntsForFeature = (featureId: string) =>
		fullCustomerToCustomerEntitlements({
			fullCustomer,
			featureId,
			entity: fullCustomer.entity,
			inStatuses: DEFAULT_PLAN_CONTROL_STATUSES,
		});
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
	if (entity_id && fullCustomer.entity) {
		const { apiEntity: apiEntityResult } = await getApiEntityBase({
			ctx,
			entity: fullCustomer.entity,
			fullCus: fullCustomer,
		});

		apiSubject = mergeCustomerBillingControlsForCheck({
			entityApiSubject: apiEntityResult,
			customerApiSubject: apiCustomer,
			planCustomerProducts: fullCustomer.customer_products,
			normalizeSpendLimitForCompare,
		});
	} else {
		apiSubject = mergePlanBillingControlsForCheck({
			customerApiSubject: apiCustomer,
			planCustomerProducts: fullCustomer.customer_products,
			normalizeSpendLimitForCompare,
		});
	}

	if (!apiSubject) {
		throw new InternalError({
			message: "failed to get entity object from cache",
		});
	}

	apiSubject = resolveCheckSpendLimits({
		subject: apiSubject,
		cusEntsForFeature: (featureId) =>
			fullCustomerToCustomerEntitlements({
				fullCustomer,
				featureId,
				entity: fullCustomer.entity,
				inStatuses: DEFAULT_PLAN_CONTROL_STATUSES,
			}),
		entityId: entity_id,
		additionalAllowanceForFeature,
	});

	const featureToUseMin = getFeatureToUseForCheck({
		creditSystems,
		feature,
		apiSubject,
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
		newFullCus: fullCustomer,
		feature: featureToUse,
	}).catch((error) => {
		ctx.logger.error(`[getCheckData] Failed to trigger auto top-up: ${error}`);
	});

	const apiBalance = apiSubject.balances?.[featureToUse.id];
	const apiFlag = apiSubject.flags?.[featureToUse.id];

	return {
		customerId: customer_id,
		entityId: entity_id,
		apiBalance,
		apiFlag,
		apiSubject,
		originalFeature: feature,
		featureToUse,
	};
};

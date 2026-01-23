import {
	type ApiCustomerV5,
	type ApiEntityV2,
	type CheckParams,
	type CustomerLegacyData,
	type Feature,
	FeatureNotFoundError,
	InternalError,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { getApiCustomerBase } from "@/internal/customers/cusUtils/apiCusUtils/getApiCustomerBase.js";
import { getOrCreateCachedFullCustomer } from "@/internal/customers/cusUtils/fullCustomerCacheUtils/getOrCreateCachedFullCustomer.js";
import { getApiEntityBase } from "@/internal/entities/entityUtils/apiEntityUtils/getApiEntityBase.js";
import { getCreditSystemsFromFeature } from "@/internal/features/creditSystemUtils.js";
import type { CheckData } from "../checkTypes/CheckData.js";
import { apiBalanceToAllowed } from "./apiBalanceToAllowed.js";

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

export const getFeatureToUse = ({
	creditSystems,
	feature,
	apiEntity,
	requiredBalance,
}: {
	creditSystems: Feature[];
	feature: Feature;
	apiEntity: ApiCustomerV5 | ApiEntityV2;
	requiredBalance: number;
}) => {
	// 1. If there's a credit system & cusEnts for that credit system -> return credit system
	// 2. If there's cusEnts for the feature -> return feature
	// 3. Otherwise, feaure to use is credit system if exists, otherwise return feature

	if (creditSystems.length === 0) return feature;

	// 1. Check if feature available
	const mainBalance = apiEntity?.balances?.[feature.id];

	if (
		mainBalance &&
		apiBalanceToAllowed({
			apiBalance: mainBalance,
			feature,
			requiredBalance,
		})
	) {
		return feature;
	}

	for (const creditSystem of creditSystems) {
		const apiBalance = apiEntity?.balances?.[creditSystem.id];
		if (!apiBalance) continue;

		if (
			apiBalanceToAllowed({
				apiBalance,
				feature: creditSystem,
				requiredBalance,
			})
		) {
			return creditSystem;
		}
	}

	return creditSystems[0];
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

	let apiEntity: ApiCustomerV5 | ApiEntityV2 | undefined;
	let legacyData: CustomerLegacyData | undefined;
	const start = performance.now();
	const fullCustomer = await getOrCreateCachedFullCustomer({
		ctx,
		params: body,

		source: "getCheckData",
	});
	const { apiCustomer, legacyData: legacyDataResult } =
		await getApiCustomerBase({
			ctx,
			fullCus: fullCustomer,
			withAutumnId: true,
		});
	ctx.logger.debug(
		`[check] getOrCreateCachedFullCustomer took ${performance.now() - start}ms`,
	);

	apiEntity = apiCustomer;
	legacyData = legacyDataResult;
	if (entity_id && fullCustomer.entity) {
		const { apiEntity: apiEntityResult, legacyData: legacyDataResult } =
			await getApiEntityBase({
				ctx,
				entity: fullCustomer.entity,
				fullCus: fullCustomer,
			});

		apiEntity = apiEntityResult;
		legacyData = legacyDataResult;
	}

	if (!apiEntity) {
		throw new InternalError({
			message: "failed to get entity object from cache",
		});
	}

	const featureToUse = getFeatureToUse({
		creditSystems,
		feature,
		apiEntity,
		requiredBalance,
	});

	const apiBalance = apiEntity.balances?.[featureToUse.id];
	const cusFeatureLegacyData =
		legacyData?.cusFeatureLegacyData?.[featureToUse.id];

	return {
		customerId: customer_id,
		entityId: entity_id,
		apiBalance,
		originalFeature: feature,
		featureToUse,
		cusFeatureLegacyData,
	};
};

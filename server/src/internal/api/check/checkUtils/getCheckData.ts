import {
	type ApiCustomer,
	type ApiEntityV1,
	type CheckParams,
	type CustomerLegacyData,
	type Feature,
	FeatureNotFoundError,
	InternalError,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { getCreditSystemsFromFeature } from "@/internal/features/creditSystemUtils.js";
import { getOrCreateApiCustomer } from "../../../customers/cusUtils/getOrCreateApiCustomer.js";
import { getCachedApiEntity } from "../../../entities/entityUtils/apiEntityCacheUtils/getCachedApiEntity.js";
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
	apiEntity: ApiCustomer | ApiEntityV1;
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
	const { customer_id, feature_id, entity_id, entity_data, customer_data } =
		body;

	const { feature, creditSystems } = getFeatureAndCreditSystems({
		features: ctx.features,
		featureId: feature_id,
	});

	if (!feature) {
		throw new FeatureNotFoundError({ featureId: feature_id });
	}

	let apiEntity: ApiCustomer | ApiEntityV1 | undefined;
	let legacyData: CustomerLegacyData | undefined;
	const start = Date.now();
	const { apiCustomer, legacyData: legacyDataResult } =
		await getOrCreateApiCustomer({
			ctx,
			customerId: customer_id,
			customerData: customer_data,
			entityId: entity_id,
			entityData: entity_data,
		});
	ctx.logger.debug(
		`[check] getOrCreateApiCustomer took ${Date.now() - start}ms`,
	);

	apiEntity = apiCustomer;
	legacyData = legacyDataResult;
	if (entity_id) {
		const { apiEntity: apiEntityResult } = await getCachedApiEntity({
			ctx,
			customerId: customer_id,
			entityId: entity_id,
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

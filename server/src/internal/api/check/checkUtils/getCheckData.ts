import {
	type ApiCustomerV5,
	type ApiEntityV2,
	type CheckParams,
	type Feature,
	FeatureNotFoundError,
	findFeatureById,
	getFeatureToUseForCheck,
	InternalError,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { getApiCustomerBase } from "@/internal/customers/cusUtils/apiCusUtils/getApiCustomerBase.js";
import { getOrCreateCachedFullCustomer } from "@/internal/customers/cusUtils/fullCustomerCacheUtils/getOrCreateCachedFullCustomer.js";
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

	let apiEntity: ApiCustomerV5 | ApiEntityV2 | undefined;
	const start = performance.now();
	const fullCustomer = await getOrCreateCachedFullCustomer({
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

	apiEntity = apiCustomer;
	if (entity_id && fullCustomer.entity) {
		const { apiEntity: apiEntityResult } = await getApiEntityBase({
			ctx,
			entity: fullCustomer.entity,
			fullCus: fullCustomer,
		});

		apiEntity = apiEntityResult;
	}

	if (!apiEntity) {
		throw new InternalError({
			message: "failed to get entity object from cache",
		});
	}

	const featureToUseMin = getFeatureToUseForCheck({
		creditSystems,
		feature,
		apiEntity,
		requiredBalance,
	});

	const featureToUse = findFeatureById({
		features: ctx.features,
		featureId: featureToUseMin.id,
		errorOnNotFound: true,
	});

	const apiBalance = apiEntity.balances?.[featureToUse.id];

	return {
		customerId: customer_id,
		entityId: entity_id,
		apiBalance,
		originalFeature: feature,
		featureToUse,
	};
};

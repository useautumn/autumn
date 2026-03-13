import {
	type ApiCustomerV5,
	type ApiEntityV2,
	ApiVersion,
	type CheckParams,
	type Feature,
	FeatureNotFoundError,
	findFeatureById,
	getFeatureToUseForCheck,
	InternalError,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { triggerAutoTopUp } from "@/internal/balances/autoTopUp/triggerAutoTopUp.js";
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

	let apiSubject: ApiCustomerV5 | ApiEntityV2 | undefined;
	const start = performance.now();
	const fullCustomer = await getOrCreateCachedFullCustomer({
		ctx,
		params: body,
		source: "getCheckData",
		skipCreate: ctx.apiVersion.gte(ApiVersion.V2_1), // skip auto creation after v2.1
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
	if (entity_id && fullCustomer.entity) {
		const { apiEntity: apiEntityResult } = await getApiEntityBase({
			ctx,
			entity: fullCustomer.entity,
			fullCus: fullCustomer,
		});

		apiSubject = apiEntityResult;
	}

	if (!apiSubject) {
		throw new InternalError({
			message: "failed to get entity object from cache",
		});
	}

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

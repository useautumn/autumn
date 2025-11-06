import {
	type ApiCustomer,
	type ApiEntity,
	type CheckParams,
	CusProductStatus,
	ErrCode,
	type Feature,
	InternalError,
} from "@autumn/shared";
import { StatusCodes } from "http-status-codes";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { getCreditSystemsFromFeature } from "@/internal/features/creditSystemUtils.js";
import RecaseError from "@/utils/errorUtils.js";
import { getOrCreateApiCustomer } from "../../../customers/cusUtils/getOrCreateApiCustomer.js";
import { getCachedApiEntity } from "../../../entities/entityUtils/apiEntityCacheUtils/getCachedApiEntity.js";
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

export const getFeatureToUse = ({
	creditSystems,
	feature,
	apiEntity,
}: {
	creditSystems: Feature[];
	feature: Feature;
	apiEntity: ApiCustomer | ApiEntity;
}) => {
	// 1. If there's a credit system & cusEnts for that credit system -> return credit system
	// 2. If there's cusEnts for the feature -> return feature
	// 3. Otherwise, feaure to use is credit system if exists, otherwise return feature

	if (creditSystems.length === 0) return feature;

	// 1. Check if feature available
	const mainCusFeature = apiEntity.features?.[feature.id];

	if (mainCusFeature?.balance && mainCusFeature.balance > 0) return feature;

	return creditSystems[0];

	// const featureCusEnts = cusEnts.filter((cusEnt) =>
	// 	cusEntMatchesFeature({ cusEnt, feature }),
	// );

	// if (creditSystems.length > 0) {
	// 	const creditCusEnts = cusEnts.filter((cusEnt) =>
	// 		cusEntMatchesFeature({ cusEnt, feature: creditSystems[0] }),
	// 	);

	// 	const totalFeatureCusEntBalance = sumValues(
	// 		featureCusEnts
	// 			.map((cusEnt) =>
	// 				cusEntToBalance({
	// 					cusEnt,
	// 					withRollovers: true,
	// 				}),
	// 			)
	// 			.filter(notNullish),
	// 	);

	// 	const totalCreditCusEntBalance = sumValues(
	// 		creditCusEnts
	// 			.map((cusEnt) =>
	// 				cusEntToBalance({
	// 					cusEnt,
	// 					withRollovers: true,
	// 				}),
	// 			)
	// 			.filter(notNullish),
	// 	);

	// 	if (featureCusEnts.length > 0 && totalFeatureCusEntBalance > 0) {
	// 		return feature;
	// 	}

	// 	// if (creditCusEnts.length > 0) {
	// 	// 	return creditSystems[0];
	// 	// }

	// 	return creditSystems[0];
	// }

	// return feature;
};

export const getCheckData = async ({
	ctx,
	body,
}: {
	ctx: AutumnContext;
	body: CheckParams & { feature_id: string };
}): Promise<CheckData> => {
	const { customer_id, feature_id, customer_data, entity_id } = body;
	const { org } = ctx;

	const { feature, creditSystems, allFeatures } = getFeatureAndCreditSystems({
		features: ctx.features,
		featureId: feature_id,
	});

	if (!feature) {
		throw new RecaseError({
			message: `feature with id ${feature_id} not found`,
			code: ErrCode.FeatureNotFound,
			statusCode: StatusCodes.NOT_FOUND,
		});
	}

	const inStatuses = org.config.include_past_due
		? [CusProductStatus.Active, CusProductStatus.PastDue]
		: [CusProductStatus.Active];

	// const customer = await getOrCreateCustomer({
	// 	req: ctx as ExtendedRequest,
	// 	customerId: customer_id,
	// 	customerData: customer_data,
	// 	inStatuses,
	// 	entityId: entity_id,
	// 	entityData: body.entity_data,
	// 	withCache: true,
	// });

	let apiEntity: ApiCustomer | ApiEntity | undefined;
	apiEntity = await getOrCreateApiCustomer({
		ctx,
		customerId: customer_id,
		withAutumnId: true,
	});

	if (entity_id) {
		const { apiEntity: apiEntityResult } = await getCachedApiEntity({
			ctx,
			customerId: customer_id,
			entityId: entity_id,
			withAutumnId: false,
		});

		apiEntity = apiEntityResult;
	}

	if (!apiEntity) {
		throw new InternalError({
			message: "failed to get entity object from cache",
		});
	}
	// if (entity_id) {
	// 	const cusFeature = apiCustomer.features[feature.id];
	// }

	// const cusProducts = customer.customer_products;

	// let cusEnts = cusProductsToCusEnts({ cusProducts });

	// if (customer.entity) {
	// 	cusEnts = cusEnts.filter((cusEnt) =>
	// 		cusEntMatchesEntity({
	// 			cusEnt,
	// 			entity: customer.entity!,
	// 			features: allFeatures,
	// 		}),
	// 	);
	// }

	const featureToUse = getFeatureToUse({
		creditSystems,
		feature,
		apiEntity,
	});

	// const filteredCusEnts = cusEnts.filter((cusEnt) =>
	// 	cusEntMatchesFeature({ cusEnt, feature: featureToUse }),
	// );

	return {
		customerId: customer_id,
		entityId: entity_id,
		cusFeature: apiEntity.features?.[feature.id],
		// cusEnts: filteredCusEnts,
		originalFeature: feature,
		featureToUse,
		// cusProducts,
		// entity: customer.entity,
		// allFeatures,
		// entity: customer.entity,
	};
};

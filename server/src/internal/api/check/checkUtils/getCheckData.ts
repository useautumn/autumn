import {
	type CheckParams,
	CusProductStatus,
	cusEntToBalance,
	cusProductsToCusEnts,
	ErrCode,
	type Feature,
	type FullCusEntWithFullCusProduct,
	notNullish,
	sumValues,
} from "@autumn/shared";
import { StatusCodes } from "http-status-codes";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import {
	cusEntMatchesEntity,
	cusEntMatchesFeature,
} from "@/internal/customers/cusProducts/cusEnts/cusEntUtils/findCusEntUtils.js";
import { getOrCreateCustomer } from "@/internal/customers/cusUtils/getOrCreateCustomer.js";
import { getCreditSystemsFromFeature } from "@/internal/features/creditSystemUtils.js";
import RecaseError from "@/utils/errorUtils.js";
import type { ExtendedRequest } from "@/utils/models/Request.js";
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
	cusEnts,
}: {
	creditSystems: Feature[];
	feature: Feature;
	cusEnts: FullCusEntWithFullCusProduct[];
}) => {
	// 1. If there's a credit system & cusEnts for that credit system -> return credit system
	// 2. If there's cusEnts for the feature -> return feature
	// 3. Otherwise, feaure to use is credit system if exists, otherwise return feature

	const featureCusEnts = cusEnts.filter((cusEnt) =>
		cusEntMatchesFeature({ cusEnt, feature }),
	);

	if (creditSystems.length > 0) {
		const creditCusEnts = cusEnts.filter((cusEnt) =>
			cusEntMatchesFeature({ cusEnt, feature: creditSystems[0] }),
		);

		const totalFeatureCusEntBalance = sumValues(
			featureCusEnts
				.map((cusEnt) =>
					cusEntToBalance({
						cusEnt,
						withRollovers: true,
					}),
				)
				.filter(notNullish),
		);

		const totalCreditCusEntBalance = sumValues(
			creditCusEnts
				.map((cusEnt) =>
					cusEntToBalance({
						cusEnt,
						withRollovers: true,
					}),
				)
				.filter(notNullish),
		);

		if (featureCusEnts.length > 0 && totalFeatureCusEntBalance > 0) {
			return feature;
		}

		// if (creditCusEnts.length > 0) {
		// 	return creditSystems[0];
		// }

		return creditSystems[0];
	}

	return feature;
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

	const customer = await getOrCreateCustomer({
		req: ctx as ExtendedRequest,
		customerId: customer_id,
		customerData: customer_data,
		inStatuses,
		entityId: entity_id,
		entityData: body.entity_data,
		withCache: true,
	});

	const cusProducts = customer.customer_products;

	let cusEnts = cusProductsToCusEnts({
		cusProducts,
		inStatuses: org.config.include_past_due
			? [CusProductStatus.Active, CusProductStatus.PastDue]
			: [CusProductStatus.Active],
	});

	if (customer.entity) {
		cusEnts = cusEnts.filter((cusEnt) =>
			cusEntMatchesEntity({
				cusEnt,
				entity: customer.entity!,
				features: allFeatures,
			}),
		);
	}

	const featureToUse = getFeatureToUse({
		creditSystems,
		feature,
		cusEnts,
	});

	const filteredCusEnts = cusEnts.filter((cusEnt) =>
		cusEntMatchesFeature({ cusEnt, feature: featureToUse }),
	);

	return {
		fullCus: customer,
		cusEnts: filteredCusEnts,
		originalFeature: feature,
		featureToUse,
		cusProducts,
		entity: customer.entity,
		// allFeatures,
		// entity: customer.entity,
	};
};

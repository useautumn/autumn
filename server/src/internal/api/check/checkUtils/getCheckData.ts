import {
	CusProductStatus,
	cusProductsToCusEnts,
	ErrCode,
	type Feature,
} from "@autumn/shared";
import { StatusCodes } from "http-status-codes";
import { cusEntMatchesEntity } from "@/internal/customers/cusProducts/cusEnts/cusEntUtils/findCusEntUtils.js";
import { getOrCreateCustomer } from "@/internal/customers/cusUtils/getOrCreateCustomer.js";
import { getCreditSystemsFromFeature } from "@/internal/features/creditSystemUtils.js";
import RecaseError from "@/utils/errorUtils.js";

// Main functions
const getFeatureAndCreditSystems = ({
	req,
	featureId,
}: {
	req: any;
	featureId: string;
}) => {
	const { features } = req;

	const feature: Feature | undefined = features.find(
		(feature: Feature) => feature.id === featureId,
	);

	const creditSystems = getCreditSystemsFromFeature({
		featureId,
		features,
	});

	return { feature, creditSystems, allFeatures: features };
};

export const getCheckData = async ({ req }: { req: any }) => {
	const { customer_id, feature_id, customer_data, entity_id } = req.body;

	const { org, logger } = req;

	const { feature, creditSystems, allFeatures } = getFeatureAndCreditSystems({
		req,
		featureId: feature_id,
	});

	// 1. Get org and features
	const startTime = Date.now();

	logger.info(`running /check for org: ${org.slug}, feature: ${feature_id}`);

	const inStatuses = org.config.include_past_due
		? [CusProductStatus.Active, CusProductStatus.PastDue]
		: [CusProductStatus.Active];

	const customer = await getOrCreateCustomer({
		req,
		customerId: customer_id,
		customerData: customer_data,
		inStatuses,
		entityId: entity_id,
		entityData: req.body.entity_data,
		withCache: true,
	});

	const duration = Date.now() - startTime;
	logger.info(`/check: fetched org, features & customer in ${duration}ms`);

	if (!feature) {
		throw new RecaseError({
			message: `feature with id ${feature_id} not found`,
			code: ErrCode.FeatureNotFound,
			statusCode: StatusCodes.NOT_FOUND,
		});
	}

	const cusProducts = customer.customer_products;

	let cusEnts = cusProductsToCusEnts({ cusProducts });

	if (customer.entity) {
		cusEnts = cusEnts.filter((cusEnt) =>
			cusEntMatchesEntity({
				cusEnt,
				entity: customer.entity!,
				features: allFeatures,
			}),
		);
	}

	return {
		fullCus: customer,
		cusEnts,
		feature,
		creditSystems,
		org,
		cusProducts,
		allFeatures,
		entity: customer.entity,
	};
};

// const creditSystems: Feature[] = features.filter((feature: Feature) => {
//   return (
//     feature.type == FeatureType.CreditSystem &&
//     feature.config.schema.some(
//       (schema: any) => schema.metered_feature_id === featureId,
//     )
//   );
// });

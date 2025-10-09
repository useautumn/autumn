import {
	type ApiCusProduct,
	ApiVersion,
	ApiVersionClass,
	type AppEnv,
	type Entity,
	type EntityExpand,
	type EntityResponse,
	ErrCode,
	type Feature,
	type FullCusProduct,
	type FullCustomer,
	notNullish,
	type Organization,
	type Subscription,
} from "@autumn/shared";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { getCusWithCache } from "@/internal/customers/cusCache/getCusWithCache.js";
import { getCusFeaturesResponse } from "@/internal/customers/cusUtils/cusFeatureResponseUtils/getCusFeaturesResponse.js";
import { processFullCusProducts } from "@/internal/customers/cusUtils/cusProductResponseUtils/processFullCusProducts.js";
import RecaseError from "@/utils/errorUtils.js";
import { nullish } from "@/utils/genUtils.js";

export const getSingleEntityResponse = async ({
	entityId,
	org,
	env,
	fullCus,
	entity,
	features,
	withAutumnId = false,
}: {
	entityId: string;
	org: Organization;
	env: AppEnv;
	fullCus: FullCustomer;
	entity: Entity;
	features: Feature[];
	withAutumnId?: boolean;
}) => {
	const apiVersion = new ApiVersionClass(ApiVersion.V1_2);

	if (!entity) {
		throw new RecaseError({
			message: `Entity ${entityId} not found for customer ${fullCus.id}`,
			code: ErrCode.EntityNotFound,
			statusCode: 400,
		});
	}

	const entityCusProducts = fullCus.customer_products.filter(
		(p: FullCusProduct) => {
			if (org.config.entity_product) {
				return (
					notNullish(p.internal_entity_id) &&
					p.internal_entity_id === entity.internal_id
				);
			}

			return (
				p.internal_entity_id === entity.internal_id ||
				nullish(p.internal_entity_id)
			);
		},
	);

	const entitySubs = (fullCus.subscriptions || []).filter((s: Subscription) =>
		entityCusProducts.some((p: FullCusProduct) =>
			p.subscription_ids?.includes(s.stripe_id || ""),
		),
	);

	const { main, addOns } = await processFullCusProducts({
		fullCusProducts: entityCusProducts,
		entity,
		subs: entitySubs,
		org,
		apiVersion,
		features,
	});

	const products: ApiCusProduct[] = [...main, ...addOns];

	const cusFeatures = await getCusFeaturesResponse({
		cusProducts: entityCusProducts,
		org,
		entity,
		apiVersion,
	});

	return {
		...(withAutumnId ? { autumn_id: entity.internal_id } : {}),
		id: entity.id,
		name: entity.name,
		created_at: entity.created_at,
		// feature_id: entity.feature_id,
		customer_id: fullCus.id || fullCus.internal_id,
		env,
		products,
		features: cusFeatures,
	};
};

export const getEntityResponse = async ({
	db,
	entityIds,
	org,
	env,
	customerId,
	expand,
	entityId,
	withAutumnId = false,
	apiVersion,
	features,
	logger,
	skipCache = false,
}: {
	db: DrizzleCli;
	entityIds: string[];
	org: Organization;
	env: AppEnv;
	customerId: string;
	expand?: EntityExpand[];
	entityId?: string;
	withAutumnId?: boolean;
	apiVersion: number;
	features: Feature[];
	logger: any;
	skipCache?: boolean;
}) => {
	const fullCus = await getCusWithCache({
		db,
		idOrInternalId: customerId,
		org,
		env,
		expand,
		entityId,
		logger,
		skipCache,
	});

	if (!fullCus) {
		throw new RecaseError({
			message: `Customer ${customerId} not found`,
			code: ErrCode.CustomerNotFound,
			statusCode: 400,
		});
	}

	const entityResponses: EntityResponse[] = [];

	for (const entityId of entityIds) {
		const entity = fullCus.entities.find(
			(e: Entity) => e.id === entityId || e.internal_id === entityId,
		);

		if (!entity) {
			throw new RecaseError({
				message: `Entity ${entityId} not found for customer ${fullCus.id}`,
				code: ErrCode.EntityNotFound,
				statusCode: 400,
			});
		}

		const entityResponse = await getSingleEntityResponse({
			entityId,
			org,
			env,
			fullCus,
			entity,
			features,
			withAutumnId,
		});

		entityResponses.push(entityResponse);
	}

	return {
		entities: entityResponses,
		customer: fullCus,
		fullEntities: fullCus.entities,
		invoices: fullCus.invoices,
	};
};

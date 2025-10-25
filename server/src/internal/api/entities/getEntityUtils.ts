import {
	type ApiEntity,
	type Entity,
	type EntityExpand,
	ErrCode,
	type FullCusProduct,
	type FullCustomer,
	notNullish,
	type Subscription,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { CusService } from "@/internal/customers/CusService.js";
import { getApiCusPlans } from "@/internal/customers/cusUtils/apiCusUtils/getApiCusPlan/getApiCusPlans.js";
import { getCusFeaturesResponse } from "@/internal/customers/cusUtils/cusFeatureResponseUtils/getCusFeaturesResponse.js";
import RecaseError from "@/utils/errorUtils.js";
import { nullish } from "@/utils/genUtils.js";

export const getSingleEntityResponse = async ({
	ctx,
	entityId,
	fullCus,
	entity,
	withAutumnId = false,
}: {
	ctx: AutumnContext;
	entityId: string;
	fullCus: FullCustomer;
	entity: Entity;
	withAutumnId?: boolean;
}) => {
	const { org, env, apiVersion } = ctx;

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

	const fullEntity = structuredClone(fullCus);
	fullEntity.customer_products = entityCusProducts;
	fullEntity.subscriptions = entitySubs;

	// const { main, addOns } = await processFullCusProducts({
	// 	fullCusProducts: entityCusProducts,
	// 	entity,
	// 	subs: entitySubs,
	// 	org,
	// 	apiVersion,
	// 	features,
	// });

	// const products: ApiCusProduct[] = [...main, ...addOns];
	const { apiCusPlans } = await getApiCusPlans({
		ctx,
		fullCus: fullEntity,
	});

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
		plans: apiCusPlans,
		features: cusFeatures,
	} satisfies ApiEntity;
};

export const getEntityResponse = async ({
	ctx,
	entityIds,
	customerId,
	expand,
	entityId,
	withAutumnId = false,
	skipCache = false,
}: {
	ctx: AutumnContext;
	entityIds: string[];
	customerId: string;
	expand?: EntityExpand[];
	entityId?: string;
	withAutumnId?: boolean;
	skipCache?: boolean;
}) => {
	// const fullCus = await getCusWithCache({
	// 	db,
	// 	idOrInternalId: customerId,
	// 	org,
	// 	env,
	// 	expand,
	// 	entityId,
	// 	logger,
	// 	skipCache,
	// });

	// don't use cache anymore?

	const { org, env, features, db } = ctx;

	const fullCus = await CusService.getFull({
		db,
		idOrInternalId: customerId,
		orgId: org.id,
		env,
		entityId,
		expand,
		withSubs: true,
		withEntities: true,
	});

	if (!fullCus) {
		throw new RecaseError({
			message: `Customer ${customerId} not found`,
			code: ErrCode.CustomerNotFound,
			statusCode: 400,
		});
	}

	const entityResponses: ApiEntity[] = [];

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
			ctx,
			entityId,
			fullCus,
			entity,
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

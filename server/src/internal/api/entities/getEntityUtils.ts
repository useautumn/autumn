import {
	type AppEnv,
	type CusProductResponse,
	type Entity,
	type EntityExpand,
	type EntityResponse,
	ErrCode,
	type Feature,
	type FullCusProduct,
	type Organization,
	type Subscription,
} from "@autumn/shared";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { getCusWithCache } from "@/internal/customers/cusCache/getCusWithCache.js";
import { getCusFeaturesResponse } from "@/internal/customers/cusUtils/cusFeatureResponseUtils/getCusFeaturesResponse.js";
import { processFullCusProducts } from "@/internal/customers/cusUtils/cusProductResponseUtils/processFullCusProducts.js";
import RecaseError from "@/utils/errorUtils.js";
import { nullish } from "@/utils/genUtils.js";

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
	// let customer = await CusService.getFull({
	//   db,
	//   idOrInternalId: customerId,
	//   orgId: org.id,
	//   env,
	//   withEntities: true,
	//   withSubs: true,
	//   expand,
	//   entityId,
	// });
	const customer = await getCusWithCache({
		db,
		idOrInternalId: customerId,
		org,
		env,
		expand,
		entityId,
		logger,
		skipCache,
	});

	if (!customer) {
		throw new RecaseError({
			message: `Customer ${customerId} not found`,
			code: ErrCode.CustomerNotFound,
			statusCode: 400,
		});
	}

	const entities = customer.entities.filter((e: Entity) =>
		entityIds.includes(e.id),
	);

	const entityCusProducts = customer.customer_products.filter(
		(p: FullCusProduct) =>
			entities.some((e: Entity) => e.internal_id === p.internal_entity_id) ||
			nullish(p.internal_entity_id),
	);

	const subs = customer.subscriptions || [];

	const entityResponses: EntityResponse[] = [];
	for (const entityId of entityIds) {
		const entity = customer.entities.find(
			(e: Entity) => e.id === entityId || e.internal_id === entityId,
		);
		if (!entity) {
			throw new RecaseError({
				message: `Entity ${entityId} not found for customer ${customerId}`,
				code: ErrCode.EntityNotFound,
				statusCode: 400,
			});
		}

		const entitySubs = subs.filter((s: Subscription) =>
			entityCusProducts.some((p: FullCusProduct) =>
				p.subscription_ids?.includes(s.stripe_id || ""),
			),
		);

		const { main, addOns } = await processFullCusProducts({
			fullCusProducts: entityCusProducts,
			entities: customer.entities,
			subs: entitySubs,
			org,
			apiVersion,
			features,
		});

		const products: CusProductResponse[] = [...main, ...addOns];

		const cusFeatures = await getCusFeaturesResponse({
			cusProducts: entityCusProducts,
			org,
			entity,
			apiVersion,
		});

		entityResponses.push({
			...(withAutumnId ? { autumn_id: entity.internal_id } : {}),
			id: entity.id,
			name: entity.name,
			created_at: entity.created_at,
			// feature_id: entity.feature_id,
			customer_id: customerId,
			env,
			products,
			features: cusFeatures,
		});
	}

	return {
		entities: entityResponses,
		customer,
		fullEntities: customer.entities,
		invoices: customer.invoices,
	};
};

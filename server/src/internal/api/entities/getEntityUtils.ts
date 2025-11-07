import {
	type ApiCusProduct,
	ApiVersion,
	ApiVersionClass,
	type AppEnv,
	type Entity,
	ErrCode,
	type Feature,
	type FullCusProduct,
	type FullCustomer,
	notNullish,
	type Organization,
	type Subscription,
} from "@autumn/shared";
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

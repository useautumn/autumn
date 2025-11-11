import {
	type ApiEntity,
	type Entity,
	ErrCode,
	type FullCusProduct,
	type FullCustomer,
	notNullish,
	type Subscription,
} from "@autumn/shared";
import { getCusFeaturesResponse } from "@/internal/customers/cusUtils/cusFeatureResponseUtils/getCusFeaturesResponse.js";
import RecaseError from "@/utils/errorUtils.js";
import { nullish } from "@/utils/genUtils.js";
import type { AutumnContext } from "../../../honoUtils/HonoEnv.js";
import { getApiSubscriptions } from "../../customers/cusUtils/apiCusUtils/getApiSubscription/getApiSubscriptions.js";

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
	const { data: apiSubscriptions, legacyData } = await getApiSubscriptions({
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
		entity: {
			...(withAutumnId ? { autumn_id: entity.internal_id } : {}),
			id: entity.id,
			name: entity.name,
			created_at: entity.created_at,
			// feature_id: entity.feature_id,
			customer_id: fullCus.id || fullCus.internal_id,
			env,
			plans: apiSubscriptions,
			features: cusFeatures,
		} satisfies ApiEntity,
		legacyData,
	};
};

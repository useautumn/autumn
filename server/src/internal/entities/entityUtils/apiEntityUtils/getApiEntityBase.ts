import {
	type ApiEntity,
	ApiEntitySchema,
	type Entity,
	type FullCustomer,
	filterCusProductsByEntity,
} from "@autumn/shared";
import { z } from "zod/v4";
import type { RequestContext } from "@/honoUtils/HonoEnv.js";
import { getApiCusFeatures } from "@/internal/customers/cusUtils/apiCusUtils/getApiCusFeature/getApiCusFeatures.js";
import { getApiCusProducts } from "@/internal/customers/cusUtils/apiCusUtils/getApiCusProduct/getApiCusProducts.js";

/**
 * Get base ApiEntity without expand fields
 * This is the core entity object that can be cached
 */
export const getApiEntityBase = async ({
	ctx,
	entity,
	fullCus,
	withAutumnId = false,
}: {
	ctx: RequestContext;
	entity: Entity;
	fullCus: FullCustomer;
	withAutumnId?: boolean;
}): Promise<{ apiEntity: ApiEntity }> => {
	const { org } = ctx;

	// Filter customer products for this entity
	const entityCusProducts = filterCusProductsByEntity({
		cusProducts: fullCus.customer_products,
		entity,
		org,
	});

	// Create filtered fullCus with entity-specific products and entity set
	const filteredFullCus = {
		...fullCus,
		customer_products: entityCusProducts,
		entity, // Set entity for entity-specific balance calculations
	};

	// Reuse existing customer functions with filtered products
	const apiEntityFeatures = await getApiCusFeatures({
		ctx,
		fullCus: filteredFullCus,
	});

	const { apiCusProducts: apiEntityProducts } = await getApiCusProducts({
		ctx,
		fullCus: filteredFullCus,
	});

	const apiEntity = ApiEntitySchema.extend({
		autumn_id: z.string().optional(),
	}).parse({
		autumn_id: withAutumnId ? entity.internal_id : undefined,

		id: entity.id || null,
		name: entity.name || null,
		customer_id: fullCus.id || fullCus.internal_id,
		// feature_id: entity.feature_id || null,
		created_at: entity.created_at,
		env: fullCus.env,

		products: apiEntityProducts,
		features: apiEntityFeatures,
	});

	return {
		apiEntity,
	};
};

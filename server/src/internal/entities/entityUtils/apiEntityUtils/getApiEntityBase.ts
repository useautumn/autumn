import {
	type ApiEntityV2,
	ApiEntityV2Schema,
	type Entity,
	type EntityLegacyData,
	type FullCustomer,
	filterCusProductsByEntity,
} from "@autumn/shared";
import { z } from "zod/v4";
import type { RequestContext } from "@/honoUtils/HonoEnv.js";
import { getApiBalances } from "@/internal/customers/cusUtils/apiCusUtils/getApiBalance/getApiBalances.js";
import { getApiSubscriptions } from "../../../customers/cusUtils/apiCusUtils/getApiSubscription/getApiSubscriptions.js";

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
}): Promise<{ apiEntity: ApiEntityV2; legacyData: EntityLegacyData }> => {
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
	const { data: apiBalances, legacyData: cusFeatureLegacyData } =
		await getApiBalances({
			ctx,
			fullCus: filteredFullCus,
		});

	const { data: apiSubscriptions, legacyData: cusProductLegacyData } =
		await getApiSubscriptions({
			ctx,
			fullCus: filteredFullCus,
		});

	const apiEntity = ApiEntityV2Schema.extend({
		autumn_id: z.string().optional(),
	}).parse({
		autumn_id: withAutumnId ? entity.internal_id : undefined,

		id: entity.id || null,
		name: entity.name || null,
		customer_id: fullCus.id || fullCus.internal_id,
		created_at: entity.created_at,
		env: fullCus.env,

		subscriptions: apiSubscriptions,
		balances: apiBalances,
	} satisfies ApiEntityV2);

	return {
		apiEntity,
		legacyData: {
			cusProductLegacyData,
			cusFeatureLegacyData,
		},
	};
};

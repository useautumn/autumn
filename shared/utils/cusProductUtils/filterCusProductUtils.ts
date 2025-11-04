import { notNullish, nullish } from "@utils/utils.js";
import type { Entity } from "../../models/cusModels/entityModels/entityModels.js";
import type { FullCusProduct } from "../../models/cusProductModels/cusProductModels.js";
import type { Organization } from "../../models/orgModels/orgTable.js";

/**
 * Filter customer products by entity
 * Used to get entity-specific products for entity API responses
 */
export const filterCusProductsByEntity = ({
	cusProducts,
	entity,
	org,
}: {
	cusProducts: FullCusProduct[];
	entity: Entity;
	org: Organization;
}): FullCusProduct[] => {
	return cusProducts.filter((p: FullCusProduct) => {
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
	});
};

// export const filterOutEntitiesFromCusProducts = ({
// 	cusProducts,
// }: {
// 	cusProducts: FullCusProduct[];
// }): FullCusProduct[] => {
// 	// 1. Remove cus products with internal_entity_id
// 	const finalCusProducts = cusProducts.filter((p: FullCusProduct) => {
// 		return nullish(p.internal_entity_id);
// 	});

// 	// 2. Remove cus products with entity balances...
// 	for (let i = 0; i < finalCusProducts.length; i++) {
// 		finalCusProducts[i].customer_entitlements = finalCusProducts[
// 			i
// 		].customer_entitlements.filter((cusEnt: FullCustomerEntitlement) => {
// 			return nullish(cusEnt.entitlement.entity_feature_id);
// 		});
// 	}

// 	return finalCusProducts;
// };

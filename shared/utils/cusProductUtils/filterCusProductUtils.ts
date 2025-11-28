import { CusProductStatus, type FullCustomer } from "../../index.js";
import type { Entity } from "../../models/cusModels/entityModels/entityModels.js";
import type { FullCustomerEntitlement } from "../../models/cusProductModels/cusEntModels/cusEntModels.js";
import type { FullCusProduct } from "../../models/cusProductModels/cusProductModels.js";
import type { Organization } from "../../models/orgModels/orgTable.js";
import { notNullish, nullish } from "../utils.js";

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

export const filterEntityLevelCusProducts = ({
	cusProducts,
}: {
	cusProducts: FullCusProduct[];
}): FullCusProduct[] => {
	const finalCusProducts: FullCusProduct[] = structuredClone(cusProducts);
	for (let i = 0; i < finalCusProducts.length; i++) {
		if (notNullish(finalCusProducts[i].internal_entity_id)) continue;

		const newCusEnts = cusProducts[i].customer_entitlements.filter((ce) =>
			notNullish(ce.entitlement.entity_feature_id),
		);

		finalCusProducts[i].customer_entitlements = newCusEnts;
	}

	// finalCusProducts = finalCusProducts.filter((cp: FullCusProduct) => {
	// 	// 1. If no cusEnts, return false
	// 	const cusEnts = cp.customer_entitlements;
	// 	if (cusEnts.length === 0) return false;

	// 	// 2. If any cusEnt has an entity feature id, return true
	// 	if (
	// 		cusEnts.some((cusEnt: FullCustomerEntitlement) =>
	// 			notNullish(cusEnt.entitlement.entity_feature_id),
	// 		)
	// 	)
	// 		return true;

	// 	if (cp.internal_entity_id) {
	// 		return true;
	// 	}

	// 	return false;
	// });

	return finalCusProducts;
};

export const filterOutEntitiesFromCusProducts = ({
	cusProducts,
}: {
	cusProducts: FullCusProduct[];
}): FullCusProduct[] => {
	// 1. Remove cus products with internal_entity_id
	const finalCusProducts = structuredClone(cusProducts).filter(
		(p: FullCusProduct) => {
			return nullish(p.internal_entity_id);
		},
	);

	// 2. Remove cus products with entity balances...
	for (let i = 0; i < finalCusProducts.length; i++) {
		finalCusProducts[i].customer_entitlements = finalCusProducts[
			i
		].customer_entitlements.filter((cusEnt: FullCustomerEntitlement) => {
			return nullish(cusEnt.entitlement.entity_feature_id);
		});
	}

	return finalCusProducts;
};

export const getActiveCusProducts = ({
	customer,
}: {
	customer: FullCustomer;
}): FullCusProduct[] => {
	return customer.customer_products.filter(
		(p: FullCusProduct) => p.status === CusProductStatus.Active,
	);
};

export const isProductAlreadyEnabled = ({
	productId,
	customer,
	entityId,
}: {
	productId: string;
	customer: FullCustomer;
	entityId?: string;
}) => {
	return getActiveCusProducts({ customer }).some((cp: FullCusProduct) => {
		// Check if product matches and is not an add-on
		if (cp.product_id !== productId || cp.product.is_add_on) {
			return false;
		}

		// If no entityId (attaching to customer), only consider customer-level products
		if (!entityId) {
			return !cp.internal_entity_id && !cp.entity_id;
		}

		// If entityId exists (attaching to entity), only consider products for that entity
		const entities = customer?.entities || [];
		const entity = entities.find(
			(e: Entity) => e.id === entityId || e.internal_id === entityId,
		);

		if (entity) {
			return (
				cp.internal_entity_id === entity.internal_id ||
				cp.entity_id === entity.id
			);
		}

		return false;
	});
};

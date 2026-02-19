import {
	type FullCustomer,
	filterCustomerProductsByActiveStatuses,
} from "../../index.js";
import type { Entity } from "../../models/cusModels/entityModels/entityModels.js";
import type { FullCustomerEntitlement } from "../../models/cusProductModels/cusEntModels/cusEntModels.js";
import type { FullCusProduct } from "../../models/cusProductModels/cusProductModels.js";
import type { Organization } from "../../models/orgModels/orgTable.js";
import { isOneOffProduct } from "../productUtils/classifyProduct/classifyProductUtils.js";
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
	org?: Organization;
}): FullCusProduct[] => {
	return (
		cusProducts?.filter((p: FullCusProduct) => {
			if (org?.config?.entity_product) {
				return (
					notNullish(p.internal_entity_id) &&
					p.internal_entity_id === entity.internal_id
				);
			}

			return (
				p.internal_entity_id === entity.internal_id ||
				nullish(p.internal_entity_id)
			);
		}) || []
	);
};

export const filterEntityLevelCustomerEntitlementsFromFullCustomer = ({
	fullCustomer,
}: {
	fullCustomer: FullCustomer;
}): FullCustomer => {
	const finalCusProducts: FullCusProduct[] = structuredClone(
		fullCustomer?.customer_products || [],
	);
	for (let i = 0; i < finalCusProducts.length; i++) {
		if (notNullish(finalCusProducts[i].internal_entity_id)) continue;

		const newCusEnts = finalCusProducts[i].customer_entitlements.filter((ce) =>
			notNullish(ce.entitlement.entity_feature_id),
		);

		finalCusProducts[i].customer_entitlements = newCusEnts;
	}
	// Filter extra_customer_entitlements to keep only entity-level ones
	const finalExtraCusEnts = structuredClone(
		fullCustomer?.extra_customer_entitlements || [],
	).filter(
		(ce) =>
			// NEW APPROACH: has internal_entity_id
			notNullish(ce.internal_entity_id) ||
			// OLD APPROACH: has entities object with data
			(ce.entities && Object.keys(ce.entities).length > 0),
	);

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

	return {
		...fullCustomer,
		customer_products: finalCusProducts,
		extra_customer_entitlements: finalExtraCusEnts,
	} satisfies FullCustomer;
};

export const filterOutEntitiesFromFullCustomer = ({
	fullCus,
}: {
	fullCus: FullCustomer;
}): FullCustomer => {
	// 1. Remove cus products with internal_entity_id
	const finalCusProducts = structuredClone(
		fullCus?.customer_products || [],
	).filter((p: FullCusProduct) => {
		return nullish(p.internal_entity_id);
	});

	// Filter extra_customer_entitlements to remove entity-level ones
	const finalExtraCusEnts = structuredClone(
		fullCus?.extra_customer_entitlements || [],
	).filter((cusEnt: FullCustomerEntitlement) => {
		return (
			// Must NOT have entity_feature_id (per-entity feature)
			nullish(cusEnt.entitlement.entity_feature_id) &&
			// Must NOT have internal_entity_id (new approach)
			nullish(cusEnt.internal_entity_id) &&
			// Must NOT have entities object (old approach)
			(!cusEnt.entities || Object.keys(cusEnt.entities).length === 0)
		);
	});

	// 2. Remove cus products with entity balances...
	for (let i = 0; i < finalCusProducts.length; i++) {
		finalCusProducts[i].customer_entitlements = finalCusProducts[
			i
		].customer_entitlements.filter((cusEnt: FullCustomerEntitlement) => {
			return nullish(cusEnt.entitlement.entity_feature_id);
		});
	}

	return {
		...fullCus,
		customer_products: finalCusProducts,
		extra_customer_entitlements: finalExtraCusEnts,
	} satisfies FullCustomer;
};

/**
 * Returns true if a non-add-on, non-one-off product is already active for this customer/entity.
 * Used to fully disable selection in the product dropdown.
 */
export const isProductAlreadyEnabled = ({
	productId,
	customer,
	entityId,
}: {
	productId: string;
	customer: FullCustomer;
	entityId?: string;
}) => {
	return filterCustomerProductsByActiveStatuses({
		customerProducts: customer.customer_products,
	}).some((cp: FullCusProduct) => {
		const prices = cp.customer_prices.map((cp) => cp.price);

		// Check if product matches and is not an add-on or one-off
		if (
			cp.product_id !== productId ||
			cp.product.is_add_on ||
			isOneOffProduct({ prices })
		) {
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

/**
 * Returns true if any product (including add-ons) is already active for this customer/entity.
 * Used to show a non-blocking "Already Enabled" badge in the product dropdown.
 */
export const isProductCurrentlyAttached = ({
	productId,
	customer,
	entityId,
}: {
	productId: string;
	customer: FullCustomer;
	entityId?: string;
}) => {
	return filterCustomerProductsByActiveStatuses({
		customerProducts: customer.customer_products,
	}).some((cp: FullCusProduct) => {
		if (cp.product_id !== productId) {
			return false;
		}

		if (!entityId) {
			return !cp.internal_entity_id && !cp.entity_id;
		}

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

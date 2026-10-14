import {
	type FullCustomer,
	filterCustomerProductsByActiveStatuses,
} from "../../index.js";
import type { Entity } from "../../models/cusModels/entityModels/entityModels.js";
import type { FullCustomerEntitlement } from "../../models/cusProductModels/cusEntModels/cusEntModels.js";
import type { FullCusProduct } from "../../models/cusProductModels/cusProductModels.js";
import type { Organization } from "../../models/orgModels/orgTable.js";
import { notNullish, nullish } from "../utils.js";
import { isCustomerProductOneOff } from "./classifyCustomerProduct/classifyCustomerProduct.js";

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
	const finalExtraCusEnts = structuredClone(
		fullCustomer?.extra_customer_entitlements || [],
	).filter(
		(ce) =>
			notNullish(ce.internal_entity_id) ||
			(ce.entities && Object.keys(ce.entities).length > 0),
	);

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
	const finalCusProducts = structuredClone(
		fullCus?.customer_products || [],
	).filter((p: FullCusProduct) => {
		return nullish(p.internal_entity_id);
	});

	const finalExtraCusEnts = structuredClone(
		fullCus?.extra_customer_entitlements || [],
	).filter((cusEnt: FullCustomerEntitlement) => {
		return (
			nullish(cusEnt.entitlement.entity_feature_id) &&
			nullish(cusEnt.internal_entity_id) &&
			(!cusEnt.entities || Object.keys(cusEnt.entities).length === 0)
		);
	});

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
		if (
			cp.product_id !== productId ||
			cp.product.is_add_on ||
			isCustomerProductOneOff(cp)
		) {
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

import type { FullCustomerEntitlement } from "@models/cusProductModels/cusEntModels/cusEntModels.js";
import { Decimal } from "decimal.js";
import type { PgDeductionUpdate } from "../../api/balances/track/trackTypes/pgDeductionUpdate.js";
import type { FullCustomer } from "../../models/cusModels/fullCusModel.js";
import type { FullCusEntWithFullCusProduct } from "../../models/cusProductModels/cusEntModels/cusEntWithProduct.js";
import type { FullCusProduct } from "../../models/cusProductModels/cusProductModels.js";
import type { Feature } from "@models/featureModels/featureModels.js";
import { isPrepaidPrice } from "../productUtils/priceUtils/classifyPriceUtils.js";
import { cusEntToCusPrice } from "./convertCusEntUtils/cusEntToCusPrice.js";

export const formatCusEnt = ({
	cusEnt,
}: {
	cusEnt: FullCustomerEntitlement;
}) => {
	return `${cusEnt.entitlement.feature_id} (${cusEnt.entitlement.interval}) (${cusEnt.balance})`;
};

export const isEntityCusEnt = ({
	cusEnt,
}: {
	cusEnt: FullCusEntWithFullCusProduct;
}): boolean => {
	return !!(
		cusEnt.entitlement.entity_feature_id ||
		cusEnt.customer_product?.internal_entity_id
	);
};

export const updateCusEntInFullCus = ({
	fullCus,
	cusEntId,
	update,
}: {
	fullCus: FullCustomer;
	cusEntId: string;
	update: PgDeductionUpdate;
}) => {
	for (let i = 0; i < fullCus.customer_products.length; i++) {
		for (
			let j = 0;
			j < fullCus.customer_products[i].customer_entitlements.length;
			j++
		) {
			const ce = fullCus.customer_products[i].customer_entitlements[j];
			if (ce.id === cusEntId) {
				let replaceables = ce.replaceables ?? [];

				if (update.newReplaceables) {
					replaceables = [
						...replaceables,
						...update.newReplaceables.map((r) => ({
							...r,
							delete_next_cycle: r.delete_next_cycle ?? true,
							from_entity_id: r.from_entity_id ?? null,
						})),
					];
				}

				if (update.deletedReplaceables) {
					replaceables = replaceables.filter(
						(r) => !update.deletedReplaceables?.map((r) => r.id).includes(r.id),
					);
				}

				fullCus.customer_products[i].customer_entitlements[j] = {
					...ce,
					balance: update.balance,
					entities: update.entities,
					adjustment: update.adjustment,
					replaceables,
				};
			}
		}
	}
};

export const isPrepaidCusEnt = ({
	cusEnt,
}: {
	cusEnt: FullCusEntWithFullCusProduct;
}) => {
	// 2. If cus ent is not prepaid, skip
	const cusPrice = cusEntToCusPrice({ cusEnt });
	if (!cusPrice || !isPrepaidPrice(cusPrice.price)) return false;

	// 3. Get quantity
	const options = cusEnt.customer_product.options.find(
		(option) =>
			option.internal_feature_id === cusEnt.entitlement.internal_feature_id,
	);

	if (!options) return false;

	return true;
};

export const addCusProductToCusEnt = ({
	cusEnt,
	cusProduct,
}: {
	cusEnt: FullCustomerEntitlement;
	cusProduct: FullCusProduct;
}): FullCusEntWithFullCusProduct => {
	return {
		...cusEnt,
		customer_product: cusProduct,
	};
};

/**
 * Clones a customer entitlement and updates the quantity in its options.
 * Needed because usagePriceToLineItem reads quantity from customer_product.options.
 */
export const cloneEntitlementWithUpdatedQuantity = ({
	customerEntitlement,
	feature,
	quantityDifference,
}: {
	customerEntitlement: FullCusEntWithFullCusProduct;
	feature: Feature;
	quantityDifference: number;
}): FullCusEntWithFullCusProduct => {
	const cloned = structuredClone(customerEntitlement);
	const optionIndex = cloned.customer_product.options.findIndex(
		(opt) => opt.internal_feature_id === feature.internal_id,
	);

	if (optionIndex !== -1) {
		cloned.customer_product.options[optionIndex].quantity = new Decimal(
			cloned.customer_product.options[optionIndex].quantity,
		)
			.add(quantityDifference)
			.toNumber();
	}

	return cloned;
};

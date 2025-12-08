import {
  CusProductStatus,
  cusProductToPrices,
  type FullCusProduct,
  isFreeProduct,
} from "@autumn/shared";
import type { FullCustomer } from "../../../../shared/models/cusModels/fullCusModel";
import { getRelatedCusPrice } from "../../internal/customers/cusProducts/cusEnts/cusEntUtils";
import { isOneOff } from "../../internal/products/productUtils";
import type { StateCheckResult } from "./stateCheckTypes";

export const checkCusProducts = async ({
	fullCus,
	result,
}: {
	fullCus: FullCustomer;
	result: StateCheckResult;
}): Promise<void> => {
	const cusProducts = fullCus.customer_products;
	for (const cusProduct of cusProducts) {
		const productName = cusProduct.product?.name || cusProduct.product_id;

		// Check: Scheduled products should have a main product
		if (cusProduct.status === CusProductStatus.Scheduled) {
			const mainCusProd = cusProducts.find(
				(cp: FullCusProduct) =>
					cp.product.group === cusProduct.product.group &&
					cp.id !== cusProduct.id &&
					cp.status !== CusProductStatus.Scheduled &&
					(cusProduct.internal_entity_id
						? cusProduct.internal_entity_id === cp.internal_entity_id
						: true),
			);

			if (!mainCusProd) {
				result.passed = false;
				result.errors.push(
					`Scheduled product "${productName}" has no main product`,
				);
				result.checks.push({
					name: `Scheduled Product: ${productName}`,
					type: "customer_product_correctness",
					passed: false,
					message: "No main product found for scheduled product",
				});
			} else {
				result.checks.push({
					name: `Scheduled Product: ${productName}`,
					type: "customer_product_correctness",
					passed: true,
				});
			}
		}

		// Check: No duplicate non-add-on, non-one-off products in same group
		// One-off products (like t-shirts) can coexist with any other products
		const currentPrices = cusProductToPrices({ cusProduct });
		const isCurrentOneOff = isOneOff(currentPrices);

		if (
			!cusProduct.product.is_add_on &&
			!isCurrentOneOff &&
			cusProduct.status !== CusProductStatus.Scheduled
		) {
			const group = cusProduct.product.group;
			const otherCusProd = cusProducts.find((cp: FullCusProduct) => {
				if (cp.product.group !== group) return false;
				if (cp.id === cusProduct.id) return false;
				if (cp.product.is_add_on) return false;
				if (cp.status === CusProductStatus.Scheduled) return false;
				if (cp.internal_entity_id !== cusProduct.internal_entity_id)
					return false;

				// Also skip one-off products
				const otherPrices = cusProductToPrices({ cusProduct: cp });
				if (isOneOff(otherPrices)) return false;

				return true;
			});

			if (otherCusProd) {
				result.passed = false;
				result.errors.push(
					`Duplicate products in group "${group}": "${productName}" and "${otherCusProd.product?.name}"`,
				);
				result.checks.push({
					name: `Group Uniqueness: ${productName}`,
					type: "group_uniqueness",
					passed: false,
					message: `Found duplicate: ${otherCusProd.product?.name}`,
				});
			} else {
				result.checks.push({
					name: `Group Uniqueness: ${productName}`,
					type: "group_uniqueness",
					passed: true,
				});
			}
		}

		// Check: Customer entitlements with usage_allowed should have related cus_price
		const prices = cusProductToPrices({ cusProduct });
		if (
			!isOneOff(prices) &&
			!isFreeProduct({ prices }) &&
			cusProduct.status !== CusProductStatus.Scheduled
		) {
			for (const cusEnt of cusProduct.customer_entitlements || []) {
				const cusPrice = getRelatedCusPrice(cusEnt, cusProduct.customer_prices);

				if (cusEnt.usage_allowed && !cusPrice) {
					result.passed = false;
					result.errors.push(
						`Product "${productName}": Feature "${cusEnt.feature_id}" has usage_allowed but no related cus_price`,
					);
					result.checks.push({
						name: `Entitlement Price: ${cusEnt.feature_id}`,
						type: "entitlement_price_correctness",
						passed: false,
						message: "usage_allowed but no cus_price",
					});
				}
			}
		}
	}
};

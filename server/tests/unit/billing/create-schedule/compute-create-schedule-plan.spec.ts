import { describe, expect, test } from "bun:test";
import {
	BillingVersion,
	CusProductStatus,
	type MultiAttachBillingContext,
} from "@autumn/shared";
import { contexts } from "@tests/utils/fixtures/db/contexts";
import { customerProducts } from "@tests/utils/fixtures/db/customerProducts";
import { prices } from "@tests/utils/fixtures/db/prices";
import { products } from "@tests/utils/fixtures/db/products";
import chalk from "chalk";
import { computeCreateSchedulePlan } from "@/internal/billing/v2/actions/createSchedule/compute/computeCreateSchedulePlan";

const createBillingContext = ({
	productContexts,
	currentEpochMs = Date.now(),
}: Pick<MultiAttachBillingContext, "productContexts"> & {
	currentEpochMs?: number;
}): MultiAttachBillingContext => {
	const fullProducts = productContexts.map(
		(productContext) => productContext.fullProduct,
	);
	const currentCustomerProducts = productContexts.flatMap((productContext) =>
		productContext.currentCustomerProduct
			? [productContext.currentCustomerProduct]
			: [],
	);

	return {
		...contexts.createBilling({
			customerProducts: currentCustomerProducts,
			fullProducts,
			currentEpochMs,
			billingVersion: BillingVersion.V2,
		}),
		productContexts,
		featureQuantities: [],
		checkoutMode: null,
		customPrices: [],
		customEnts: [],
		isCustom: false,
		billingVersion: BillingVersion.V2,
	};
};

describe(chalk.yellowBright("computeCreateSchedulePlan"), () => {
	test("creates immediate customer products for all first-phase plans", () => {
		const ctx = contexts.create({});
		const baseProduct = products.createFull({
			id: "base",
			prices: [prices.createFixed({ id: "price_base" })],
		});
		const addonProduct = products.createFull({
			id: "addon",
			isAddOn: true,
			prices: [prices.createFixed({ id: "price_addon" })],
		});

		const billingContext = createBillingContext({
			productContexts: [
				{
					fullProduct: baseProduct,
					customPrices: [],
					customEnts: [],
					featureQuantities: [],
				},
				{
					fullProduct: addonProduct,
					customPrices: [],
					customEnts: [],
					featureQuantities: [],
				},
			],
		});

		const result = computeCreateSchedulePlan({
			ctx,
			billingContext,
		});

		expect(result.insertCustomerProducts).toHaveLength(2);
		expect(
			result.insertCustomerProducts.map((product) => product.product_id),
		).toEqual(["base", "addon"]);
		expect(
			result.insertCustomerProducts.every(
				(product) => product.status === CusProductStatus.Active,
			),
		).toBe(true);
		expect(result.updateCustomerProduct).toBeUndefined();
		expect(result.deleteCustomerProduct).toBeUndefined();
	});

	test("expires the current product and removes a scheduled replacement during a transition", () => {
		const ctx = contexts.create({});
		const currentEpochMs = 1_000_000;
		const oldProduct = products.createFull({
			id: "starter",
			prices: [prices.createFixed({ id: "price_starter" })],
		});
		const newProduct = products.createFull({
			id: "pro",
			prices: [prices.createFixed({ id: "price_pro" })],
		});
		const currentCustomerProduct = customerProducts.create({
			id: "cus_prod_current",
			productId: oldProduct.id,
			product: oldProduct,
			status: CusProductStatus.Active,
			customerPrices: [
				prices.createCustomer({
					price: oldProduct.prices[0]!,
					customerProductId: "cus_prod_current",
				}),
			],
		});
		const scheduledCustomerProduct = customerProducts.create({
			id: "cus_prod_scheduled",
			productId: "legacy_scheduled",
			product: products.createFull({
				id: "legacy_scheduled",
				prices: [prices.createFixed({ id: "price_legacy_scheduled" })],
			}),
			status: CusProductStatus.Scheduled,
		});

		const billingContext = createBillingContext({
			currentEpochMs,
			productContexts: [
				{
					fullProduct: newProduct,
					customPrices: [],
					customEnts: [],
					featureQuantities: [],
					currentCustomerProduct,
					scheduledCustomerProduct,
				},
			],
		});

		const result = computeCreateSchedulePlan({
			ctx,
			billingContext,
		});

		expect(result.insertCustomerProducts).toHaveLength(1);
		expect(result.insertCustomerProducts[0]!.product_id).toBe("pro");
		expect(result.deleteCustomerProduct?.id).toBe("cus_prod_scheduled");
		expect(result.updateCustomerProduct?.customerProduct.id).toBe(
			"cus_prod_current",
		);
		expect(result.updateCustomerProduct?.updates.status).toBe(
			CusProductStatus.Expired,
		);
		expect(result.updateCustomerProduct?.updates.ended_at).toBe(currentEpochMs);
		expect(result.updateCustomerProduct?.updates.canceled).toBe(true);
	});
});

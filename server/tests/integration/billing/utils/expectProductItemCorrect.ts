import { expect } from "bun:test";
import type { ApiCustomerV3, ApiEntityV0 } from "@autumn/shared";
import { ApiVersion } from "@autumn/shared";
import { AutumnInt } from "@/external/autumn/autumnCli";

const defaultAutumn = new AutumnInt({ version: ApiVersion.V1_2 });

type CustomerOrEntity = ApiCustomerV3 | ApiEntityV0;

const getUpcomingQuantityValue = ({
	productItem,
}: {
	productItem: {
		upcoming_quantity?: number | null;
		next_cycle_quantity?: number | null;
	};
}) => {
	if (productItem.upcoming_quantity !== undefined)
		return productItem.upcoming_quantity ?? undefined;
	return productItem.next_cycle_quantity ?? undefined;
};

/**
 * Verify a product item (feature) on a customer/entity has the expected quantity values.
 * Useful for checking prepaid/seat quantities after attach or cycle renewal.
 *
 * @param customer - Customer or entity data (can also fetch by customerId)
 * @param productId - The product ID to check (will match products starting with this ID)
 * @param featureId - The feature ID of the item to check
 * @param quantity - Expected current quantity
 * @param upcomingQuantity - Expected upcoming_quantity (undefined means should not exist)
 */
export const expectProductItemCorrect = async ({
	customerId,
	customer: providedCustomer,
	productId,
	featureId,
	quantity,
	upcomingQuantity,
}: {
	customerId?: string;
	customer?: CustomerOrEntity;
	productId: string;
	featureId: string;
	quantity?: number;
	upcomingQuantity?: number | "undefined";
}) => {
	const customer = providedCustomer
		? providedCustomer
		: await defaultAutumn.customers.get(customerId!);

	const products = customer.products ?? [];
	// Match products that start with the productId (handles prefixed IDs like "pro_customerId")
	const product = products.find(
		(customerProduct) =>
			customerProduct.id === productId ||
			customerProduct.id?.startsWith(`${productId}_`),
	);

	if (!product) {
		const availableProductIds = products.map(
			(customerProduct) => customerProduct.id ?? "null",
		);
		throw new Error(
			`Product ${productId} not found on customer. Available products: ${availableProductIds.join(", ")}`,
		);
	}

	const item = product.items?.find(
		(productItem) => productItem.feature_id === featureId,
	);

	if (!item) {
		const availableFeatureIds = (product.items ?? []).map(
			(productItem) => productItem.feature_id ?? "null",
		);
		throw new Error(
			`Item with feature_id ${featureId} not found on product ${product.id}. Available items: ${availableFeatureIds.join(", ")}`,
		);
	}

	if (quantity !== undefined) {
		expect(
			item.quantity,
			`Product ${product.id} item ${featureId} quantity mismatch`,
		).toBe(quantity);
	}

	if (upcomingQuantity === "undefined") {
		expect(
			getUpcomingQuantityValue({ productItem: item }),
			`Product ${product.id} item ${featureId} should not have upcoming_quantity`,
		).toBeUndefined();
	} else if (upcomingQuantity !== undefined) {
		expect(
			getUpcomingQuantityValue({ productItem: item }),
			`Product ${product.id} item ${featureId} upcoming_quantity mismatch`,
		).toBe(upcomingQuantity);
	}
};

/**
 * Shorthand for checking quantity and that upcoming_quantity is not set.
 * Common case after cycle renewal when quantity changes take effect.
 */
export const expectProductItemQuantity = async (params: {
	customerId?: string;
	customer?: CustomerOrEntity;
	productId: string;
	featureId: string;
	quantity: number;
}) =>
	expectProductItemCorrect({
		...params,
		upcomingQuantity: "undefined",
	});

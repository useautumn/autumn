import { expect } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { ApiVersion } from "@autumn/shared";
import { AutumnInt } from "@/external/autumn/autumnCli";

const defaultAutumn = new AutumnInt({ version: ApiVersion.V1_2 });

type ProductState = "active" | "canceled" | "scheduled" | "undefined";

/**
 * Verify a customer/entity has the expected product in the expected state.
 *
 * @param customer - Customer or entity data (can also fetch by customerId)
 * @param productId - The product ID to check
 * @param state - Expected state: "active", "canceled", "scheduled", or "undefined" (product not present)
 */
export const expectCustomerProductCorrect = async ({
	customerId,
	customer: providedCustomer,
	productId,
	state,
}: {
	customerId?: string;
	customer?: ApiCustomerV3;
	productId: string;
	state: ProductState;
}) => {
	const customer = providedCustomer
		? providedCustomer
		: await defaultAutumn.customers.get(customerId!);

	const products = customer.products ?? [];
	const product = products.find((p: { id?: string }) => p.id === productId);

	if (state === "undefined") {
		expect(product, `Product ${productId} should not exist`).toBeUndefined();
		return;
	}

	if (!product) {
		throw new Error(
			`Product ${productId} not found but expected state: ${state}`,
		);
	}

	if (state === "active") {
		expect(String(product.status)).toBe("active");
		// canceled_at can be undefined or null when not canceled
		expect(
			product.canceled_at == null,
			`Product ${productId} should not be canceled (canceled_at: ${product.canceled_at})`,
		).toBe(true);
	} else if (state === "canceled") {
		expect(String(product.status)).toBe("active");
		expect(
			product.canceled_at != null,
			`Product ${productId} should be canceled`,
		).toBe(true);
	} else if (state === "scheduled") {
		expect(String(product.status)).toBe("scheduled");
	}
};

/**
 * Shorthand for checking product is active
 */
export const expectProductActive = async (params: {
	customerId?: string;
	customer?: ApiCustomerV3;
	productId: string;
}) => expectCustomerProductCorrect({ ...params, state: "active" });

/**
 * Shorthand for checking product is canceling (active but with canceled_at set).
 * This is the state a product enters after a downgrade - it remains active until
 * the billing cycle ends, then transitions to the new product.
 */
export const expectProductCanceling = async (params: {
	customerId?: string;
	customer?: ApiCustomerV3;
	productId: string;
}) => expectCustomerProductCorrect({ ...params, state: "canceled" });

/**
 * Shorthand for checking product is scheduled
 */
export const expectProductScheduled = async (params: {
	customerId?: string;
	customer?: ApiCustomerV3;
	productId: string;
}) => expectCustomerProductCorrect({ ...params, state: "scheduled" });

/**
 * Shorthand for checking product does not exist
 */
export const expectProductNotPresent = async (params: {
	customerId?: string;
	customer?: ApiCustomerV3;
	productId: string;
}) => expectCustomerProductCorrect({ ...params, state: "undefined" });

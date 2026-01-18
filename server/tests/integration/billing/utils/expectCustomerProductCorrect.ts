import { expect } from "bun:test";
import type { ApiCustomerV3, ApiEntityV0 } from "@autumn/shared";
import { ApiVersion } from "@autumn/shared";
import { AutumnInt } from "@/external/autumn/autumnCli";

const defaultAutumn = new AutumnInt({ version: ApiVersion.V1_2 });

type ProductState = "active" | "canceled" | "scheduled" | "undefined";
type CustomerOrEntity = ApiCustomerV3 | ApiEntityV0;

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
	customer?: ApiCustomerV3 | ApiEntityV0;
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
		// Product can be "active" or "trialing" - both are considered active states
		expect(
			product.status === "active" || product.status === "trialing",
			`Product ${productId} should be "active" or "trialing" but got "${product.status}"`,
		).toBe(true);
		// canceled_at can be undefined or null when not canceled
		expect(
			product.canceled_at == null,
			`Product ${productId} should not be canceled (canceled_at: ${product.canceled_at})`,
		).toBe(true);
	} else if (state === "canceled") {
		// Product can be "active" or "trialing" when canceling (scheduled to end)
		expect(
			product.status === "active" || product.status === "trialing",
			`Product ${productId} should be "active" or "trialing" but got "${product.status}"`,
		).toBe(true);
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
	customer?: ApiCustomerV3 | ApiEntityV0;
	productId: string;
}) => expectCustomerProductCorrect({ ...params, state: "active" });

/**
 * Shorthand for checking product is canceling (active but with canceled_at set).
 * This is the state a product enters after a downgrade - it remains active until
 * the billing cycle ends, then transitions to the new product.
 */
export const expectProductCanceling = async (params: {
	customerId?: string;
	customer?: ApiCustomerV3 | ApiEntityV0;
	productId: string;
}) => expectCustomerProductCorrect({ ...params, state: "canceled" });

/**
 * Shorthand for checking product is scheduled
 */
export const expectProductScheduled = async (params: {
	customerId?: string;
	customer?: ApiCustomerV3 | ApiEntityV0;
	productId: string;
}) => expectCustomerProductCorrect({ ...params, state: "scheduled" });

/**
 * Shorthand for checking product does not exist
 */
export const expectProductNotPresent = async (params: {
	customerId?: string;
	customer?: ApiCustomerV3 | ApiEntityV0;
	productId: string;
}) => expectCustomerProductCorrect({ ...params, state: "undefined" });

/**
 * Verify multiple product states in a single call.
 * Each array contains product IDs that should be in that state.
 *
 * @example
 * await expectProducts({
 *   customer,
 *   active: [pro.id, addon.id],
 *   canceling: [premium.id],
 *   scheduled: [free.id],
 *   notPresent: [oldProduct.id],
 * });
 */
export const expectCustomerProducts = async ({
	customerId,
	customer: providedCustomer,
	active = [],
	canceling = [],
	scheduled = [],
	notPresent = [],
}: {
	customerId?: string;
	customer?: CustomerOrEntity;
	active?: string[];
	canceling?: string[];
	scheduled?: string[];
	notPresent?: string[];
}) => {
	const customer = providedCustomer
		? providedCustomer
		: await defaultAutumn.customers.get(customerId!);

	for (const productId of active) {
		await expectCustomerProductCorrect({
			customer: customer as ApiCustomerV3,
			productId,
			state: "active",
		});
	}

	for (const productId of canceling) {
		await expectCustomerProductCorrect({
			customer: customer as ApiCustomerV3,
			productId,
			state: "canceled",
		});
	}

	for (const productId of scheduled) {
		await expectCustomerProductCorrect({
			customer: customer as ApiCustomerV3,
			productId,
			state: "scheduled",
		});
	}

	for (const productId of notPresent) {
		await expectCustomerProductCorrect({
			customer: customer as ApiCustomerV3,
			productId,
			state: "undefined",
		});
	}
};

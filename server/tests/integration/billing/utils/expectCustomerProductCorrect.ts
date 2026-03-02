import { expect } from "bun:test";
import type {
	ApiCustomerV3,
	ApiCustomerV5,
	ApiEntityV0,
	ApiEntityV2,
} from "@autumn/shared";
import { ApiVersion, formatMs } from "@autumn/shared";
import { AutumnInt } from "@/external/autumn/autumnCli";
import {
	expectSubscriptionCorrect,
	expectSubscriptionActive,
	expectSubscriptionCanceling,
	expectSubscriptionScheduled,
	expectSubscriptionPastDue,
	expectSubscriptionNotPresent,
	expectSubscriptions,
} from "./expect-customer-products/expectSubscriptionState";

const defaultAutumn = new AutumnInt({ version: ApiVersion.V1_2 });

type ProductState =
	| "active"
	| "canceled"
	| "scheduled"
	| "past_due"
	| "undefined";
type CustomerOrEntity =
	| ApiCustomerV3
	| ApiEntityV0
	| ApiCustomerV5
	| ApiEntityV2;
type V5CustomerOrEntity = ApiCustomerV5 | ApiEntityV2;

/** Type guard for V5/V2 customer/entity (has subscriptions instead of products). */
const isV5Customer = (
	customer: CustomerOrEntity,
): customer is V5CustomerOrEntity => "subscriptions" in customer;

/** Maps V3 state names to V5 state names. */
const toV5State = (
	state: ProductState,
): "active" | "canceling" | "scheduled" | "past_due" | "undefined" =>
	state === "canceled" ? "canceling" : state;

/**
 * Verify a customer/entity has the expected product in the expected state.
 * Routes to V5 subscription checks when the customer has `subscriptions`.
 */
export const expectCustomerProductCorrect = async ({
	customerId,
	customer: providedCustomer,
	productId,
	state,
}: {
	customerId?: string;
	customer?: CustomerOrEntity;
	productId: string;
	state: ProductState;
}) => {
	const customer = providedCustomer
		? providedCustomer
		: await defaultAutumn.customers.get(customerId!);

	// Route to V5 functions
	if (isV5Customer(customer)) {
		return expectSubscriptionCorrect({
			customer,
			productId,
			state: toV5State(state),
		});
	}

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
	} else if (state === "past_due") {
		expect(String(product.status)).toBe("past_due");
	}
};

/** Shorthand for checking product is active. Prefer {@link expectCustomerProducts} for batch checks. */
export const expectProductActive = async (params: {
	customerId?: string;
	customer?: CustomerOrEntity;
	productId: string;
}) => {
	if (params.customer && isV5Customer(params.customer)) {
		return expectSubscriptionActive({
			customer: params.customer,
			productId: params.productId,
		});
	}
	return expectCustomerProductCorrect({ ...params, state: "active" });
};

/**
 * Shorthand for checking product is canceling (active but with canceled_at set).
 * Prefer {@link expectCustomerProducts} for batch checks.
 */
export const expectProductCanceling = async (params: {
	customerId?: string;
	customer?: CustomerOrEntity;
	productId: string;
}) => {
	if (params.customer && isV5Customer(params.customer)) {
		return expectSubscriptionCanceling({
			customer: params.customer,
			productId: params.productId,
		});
	}
	return expectCustomerProductCorrect({ ...params, state: "canceled" });
};

/**
 * Shorthand for checking product is scheduled. Prefer {@link expectCustomerProducts} for batch checks.
 * Optionally verify the `started_at` timestamp is within a tolerance of the expected value.
 */
export const expectProductScheduled = async ({
	customerId,
	customer: providedCustomer,
	productId,
	startsAt,
	toleranceMs = 2 * 60 * 1000,
}: {
	customerId?: string;
	customer?: CustomerOrEntity;
	productId: string;
	startsAt?: number;
	toleranceMs?: number;
}) => {
	const customer = providedCustomer
		? providedCustomer
		: await defaultAutumn.customers.get(customerId!);

	// Route to V5
	if (isV5Customer(customer)) {
		return expectSubscriptionScheduled({
			customer,
			productId,
			startsAt,
			toleranceMs,
		});
	}

	await expectCustomerProductCorrect({
		customer,
		productId,
		state: "scheduled",
	});

	if (startsAt !== undefined) {
		const products = customer.products ?? [];
		const product = products.find((p: { id?: string }) => p.id === productId);

		if (!product) {
			throw new Error(`Product ${productId} not found for startsAt check`);
		}

		const actualStartsAt = product.started_at;
		const diff = Math.abs(actualStartsAt - startsAt);

		expect(
			diff <= toleranceMs,
			`Product ${productId} started_at (${formatMs(actualStartsAt)}) should be within ${toleranceMs}ms of expected (${formatMs(startsAt)}), diff: ${diff}ms`,
		).toBe(true);
	}
};

/** Shorthand for checking product is past_due. Prefer {@link expectCustomerProducts} for batch checks. */
export const expectProductPastDue = async (params: {
	customerId?: string;
	customer?: CustomerOrEntity;
	productId: string;
}) => {
	if (params.customer && isV5Customer(params.customer)) {
		return expectSubscriptionPastDue({
			customer: params.customer,
			productId: params.productId,
		});
	}
	return expectCustomerProductCorrect({ ...params, state: "past_due" });
};

/** Shorthand for checking product does not exist. Prefer {@link expectCustomerProducts} for batch checks. */
export const expectProductNotPresent = async (params: {
	customerId?: string;
	customer?: CustomerOrEntity;
	productId: string;
}) => {
	if (params.customer && isV5Customer(params.customer)) {
		return expectSubscriptionNotPresent({
			customer: params.customer,
			productId: params.productId,
		});
	}
	return expectCustomerProductCorrect({ ...params, state: "undefined" });
};

/**
 * Verify multiple product states in a single call.
 * Each array contains product IDs that should be in that state.
 */
export const expectCustomerProducts = async ({
	customerId,
	customer: providedCustomer,
	active = [],
	canceling = [],
	scheduled = [],
	pastDue = [],
	notPresent = [],
}: {
	customerId?: string;
	customer?: CustomerOrEntity;
	active?: string[];
	canceling?: string[];
	scheduled?: string[];
	pastDue?: string[];
	notPresent?: string[];
}) => {
	const customer = providedCustomer
		? providedCustomer
		: await defaultAutumn.customers.get(customerId!);

	// Route to V5
	if (isV5Customer(customer)) {
		return expectSubscriptions({
			customer,
			active,
			canceling,
			scheduled,
			pastDue,
			notPresent,
		});
	}

	for (const productId of active) {
		await expectCustomerProductCorrect({
			customer,
			productId,
			state: "active",
		});
	}

	for (const productId of canceling) {
		await expectCustomerProductCorrect({
			customer,
			productId,
			state: "canceled",
		});
	}

	for (const productId of scheduled) {
		await expectCustomerProductCorrect({
			customer,
			productId,
			state: "scheduled",
		});
	}

	for (const productId of pastDue) {
		await expectCustomerProductCorrect({
			customer,
			productId,
			state: "past_due",
		});
	}

	for (const productId of notPresent) {
		await expectCustomerProductCorrect({
			customer,
			productId,
			state: "undefined",
		});
	}
};

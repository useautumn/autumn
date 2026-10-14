import { expect } from "bun:test";
import type {
	ApiCustomerV3,
	ApiCustomerV5,
	ApiEntityV0,
	ApiEntityV2,
} from "@autumn/shared";
import { ApiVersion, formatMs } from "@autumn/shared";
import {
	type PollableExpectParams,
	pollableCustomerExpect,
} from "@tests/utils/pollableCustomerExpect.js";
import { AutumnInt } from "@/external/autumn/autumnCli";
import {
	expectSubscriptionActive,
	expectSubscriptionCanceling,
	expectSubscriptionCorrect,
	expectSubscriptionNotPresent,
	expectSubscriptionPastDue,
	expectSubscriptionScheduled,
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

const isV5Customer = (
	customer: CustomerOrEntity,
): customer is V5CustomerOrEntity => "subscriptions" in customer;

const toV5State = (
	state: ProductState,
): "active" | "canceling" | "scheduled" | "past_due" | "undefined" =>
	state === "canceled" ? "canceling" : state;

type ProductExpectParams = PollableExpectParams<CustomerOrEntity> & {
	productId: string;
	state: ProductState;
};

const assertCustomerProductCorrect = ({
	customer,
	productId,
	state,
}: ProductExpectParams & {
	customer: CustomerOrEntity;
}): void | Promise<void> => {
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
		const actual = products
			.map((p: { id?: string; status?: string }) => `${p.id}:${p.status}`)
			.join(", ");
		throw new Error(
			`Product ${productId} not found but expected state: ${state}. Customer has [${actual}]`,
		);
	}

	if (state === "active") {
		expect(
			product.status === "active" || product.status === "trialing",
			`Product ${productId} should be "active" or "trialing" but got "${product.status}"`,
		).toBe(true);
		expect(
			product.canceled_at == null,
			`Product ${productId} should not be canceled (canceled_at: ${product.canceled_at})`,
		).toBe(true);
	} else if (state === "canceled") {
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

export const expectCustomerProductCorrect = pollableCustomerExpect({
	fetchCustomer: ({ customerId, autumn }: ProductExpectParams) =>
		(autumn ?? defaultAutumn).customers.get<CustomerOrEntity>(customerId!),
	assert: assertCustomerProductCorrect,
});

export const expectProductActive = async (
	params: PollableExpectParams<CustomerOrEntity> & {
		productId: string;
	},
) => {
	if (params.customer && isV5Customer(params.customer)) {
		return expectSubscriptionActive({
			customer: params.customer,
			productId: params.productId,
		});
	}
	return expectCustomerProductCorrect({ ...params, state: "active" });
};

export const expectProductCanceling = async (
	params: PollableExpectParams<CustomerOrEntity> & {
		productId: string;
	},
) => {
	if (params.customer && isV5Customer(params.customer)) {
		return expectSubscriptionCanceling({
			customer: params.customer,
			productId: params.productId,
		});
	}
	return expectCustomerProductCorrect({ ...params, state: "canceled" });
};

type ScheduledExpectParams = PollableExpectParams<CustomerOrEntity> & {
	productId: string;
	startsAt?: number;
	toleranceMs?: number;
};

const assertProductScheduled = ({
	customer,
	productId,
	startsAt,
	toleranceMs = 2 * 60 * 1000,
}: ScheduledExpectParams & {
	customer: CustomerOrEntity;
}): void | Promise<void> => {
	if (isV5Customer(customer)) {
		return expectSubscriptionScheduled({
			customer,
			productId,
			startsAt,
			toleranceMs,
		});
	}

	assertCustomerProductCorrect({ customer, productId, state: "scheduled" });

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

export const expectProductScheduled = pollableCustomerExpect({
	fetchCustomer: ({ customerId, autumn }: ScheduledExpectParams) =>
		(autumn ?? defaultAutumn).customers.get<CustomerOrEntity>(customerId!),
	assert: assertProductScheduled,
});

export const expectProductPastDue = async (
	params: PollableExpectParams<CustomerOrEntity> & {
		productId: string;
	},
) => {
	if (params.customer && isV5Customer(params.customer)) {
		return expectSubscriptionPastDue({
			customer: params.customer,
			productId: params.productId,
		});
	}
	return expectCustomerProductCorrect({ ...params, state: "past_due" });
};

export const expectProductNotPresent = async (
	params: PollableExpectParams<CustomerOrEntity> & {
		productId: string;
	},
) => {
	if (params.customer && isV5Customer(params.customer)) {
		return expectSubscriptionNotPresent({
			customer: params.customer,
			productId: params.productId,
		});
	}
	return expectCustomerProductCorrect({ ...params, state: "undefined" });
};

type ProductsExpectParams = PollableExpectParams<CustomerOrEntity> & {
	active?: string[];
	canceling?: string[];
	scheduled?: string[];
	pastDue?: string[];
	notPresent?: string[];
};

const assertCustomerProducts = ({
	customer,
	active = [],
	canceling = [],
	scheduled = [],
	pastDue = [],
	notPresent = [],
}: ProductsExpectParams & {
	customer: CustomerOrEntity;
}): void | Promise<void> => {
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
		assertCustomerProductCorrect({ customer, productId, state: "active" });
	}

	for (const productId of canceling) {
		assertCustomerProductCorrect({ customer, productId, state: "canceled" });
	}

	for (const productId of scheduled) {
		assertCustomerProductCorrect({ customer, productId, state: "scheduled" });
	}

	for (const productId of pastDue) {
		assertCustomerProductCorrect({ customer, productId, state: "past_due" });
	}

	for (const productId of notPresent) {
		assertCustomerProductCorrect({ customer, productId, state: "undefined" });
	}
};

export const expectCustomerProducts = pollableCustomerExpect({
	fetchCustomer: ({ customerId, autumn }: ProductsExpectParams) =>
		(autumn ?? defaultAutumn).customers.get<CustomerOrEntity>(customerId!),
	assert: assertCustomerProducts,
});

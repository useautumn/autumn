import { expect } from "bun:test";
import type {
	ApiCustomerV3,
	ConfirmCheckoutResponse,
	GetCheckoutResponse,
} from "@autumn/shared";

const CHECKOUT_BASE_URL = "http://localhost:8080";
const CHECKOUT_TIMEOUT_MS = 15000;

export const fetchAutumnCheckout = async ({
	checkoutId,
}: {
	checkoutId: string;
}): Promise<GetCheckoutResponse> => {
	const response = await fetch(`${CHECKOUT_BASE_URL}/checkouts/${checkoutId}`, {
		signal: AbortSignal.timeout(CHECKOUT_TIMEOUT_MS),
	});

	expect(response.ok).toBe(true);

	return (await response.json()) as GetCheckoutResponse;
};

export const confirmAutumnCheckout = async ({
	checkoutId,
	customerId,
	productId,
}: {
	checkoutId: string;
	customerId: string;
	productId: string;
}): Promise<ConfirmCheckoutResponse> => {
	const response = await fetch(
		`${CHECKOUT_BASE_URL}/checkouts/${checkoutId}/confirm`,
		{
			method: "POST",
			signal: AbortSignal.timeout(CHECKOUT_TIMEOUT_MS),
		},
	);

	expect(response.ok).toBe(true);

	const confirmData = (await response.json()) as ConfirmCheckoutResponse;
	expect(confirmData.success).toBe(true);
	expect(confirmData.checkout_id).toBe(checkoutId);
	expect(confirmData.customer_id).toBe(customerId);
	expect(confirmData.product_id).toBe(productId);
	expect(confirmData.invoice_id).toBeDefined();

	return confirmData;
};

export const confirmAutumnCheckoutAndGetCustomer = async ({
	autumnV1,
	checkoutId,
	customerId,
	productId,
}: {
	autumnV1: {
		customers: {
			get: <T>(customerId: string) => Promise<T>;
		};
	};
	checkoutId: string;
	customerId: string;
	productId: string;
}) => {
	const confirmData = await confirmAutumnCheckout({
		checkoutId,
		customerId,
		productId,
	});
	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	return {
		confirmData,
		customer,
	};
};

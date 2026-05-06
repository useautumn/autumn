import { expect } from "bun:test";
import type {
	ApiCustomerV3,
	ConfirmCheckoutParams,
	ConfirmCheckoutResponse,
	GetCheckoutResponse,
	PreviewCheckoutResponse,
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

export const previewAutumnCheckout = async ({
	checkoutId,
	body,
}: {
	checkoutId: string;
	body: ConfirmCheckoutParams;
}): Promise<PreviewCheckoutResponse> => {
	const response = await fetch(
		`${CHECKOUT_BASE_URL}/checkouts/${checkoutId}/preview`,
		{
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify(body),
			signal: AbortSignal.timeout(CHECKOUT_TIMEOUT_MS),
		},
	);

	expect(response.ok).toBe(true);

	return (await response.json()) as PreviewCheckoutResponse;
};

export const expectAutumnCheckoutPreviewError = async ({
	checkoutId,
	body,
}: {
	checkoutId: string;
	body: ConfirmCheckoutParams;
}) => {
	const response = await fetch(
		`${CHECKOUT_BASE_URL}/checkouts/${checkoutId}/preview`,
		{
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify(body),
			signal: AbortSignal.timeout(CHECKOUT_TIMEOUT_MS),
		},
	);

	expect(response.ok).toBe(false);
};

export const confirmAutumnCheckout = async ({
	checkoutId,
	customerId,
	productId,
	featureQuantities,
	discounts,
}: {
	checkoutId: string;
	customerId: string;
	productId: string;
	featureQuantities?: Array<{ feature_id: string; quantity: number }>;
	discounts?: ConfirmCheckoutParams["discounts"];
}): Promise<ConfirmCheckoutResponse> => {
	const response = await fetch(
		`${CHECKOUT_BASE_URL}/checkouts/${checkoutId}/confirm`,
		{
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				...(featureQuantities ? { feature_quantities: featureQuantities } : {}),
				...(discounts ? { discounts } : {}),
			}),
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
	featureQuantities,
	discounts,
}: {
	autumnV1: {
		customers: {
			get: <T>(customerId: string) => Promise<T>;
		};
	};
	checkoutId: string;
	customerId: string;
	productId: string;
	featureQuantities?: Array<{ feature_id: string; quantity: number }>;
	discounts?: ConfirmCheckoutParams["discounts"];
}) => {
	const confirmData = await confirmAutumnCheckout({
		checkoutId,
		customerId,
		productId,
		featureQuantities,
		discounts,
	});
	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	return {
		confirmData,
		customer,
	};
};

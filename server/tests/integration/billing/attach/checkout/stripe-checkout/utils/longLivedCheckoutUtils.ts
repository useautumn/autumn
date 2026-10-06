import { expect } from "bun:test";

const CHECKOUT_BASE_URL =
	process.env.AUTUMN_TEST_BASE_URL ?? "http://localhost:8080";
const STRIPE_SESSION_ID_REGEX = /cs_(test|live)_[A-Za-z0-9]+/;

export const getLongLivedCheckoutId = (
	paymentUrl: string | null | undefined,
) => {
	if (!paymentUrl) throw new Error("Expected payment_url");
	const checkoutId = paymentUrl.split("/co/")[1];
	if (!checkoutId) {
		throw new Error(`Expected long-lived checkout URL: ${paymentUrl}`);
	}
	return checkoutId;
};

export const requestLongLivedCheckoutStart = (checkoutId: string) =>
	fetch(`${CHECKOUT_BASE_URL}/checkouts/${checkoutId}/start`, {
		redirect: "manual",
	});

export const startLongLivedCheckout = async (checkoutId: string) => {
	const response = await requestLongLivedCheckoutStart(checkoutId);
	expect(response.status).toBe(303);
	const location = response.headers.get("location");
	expect(location).toContain("checkout.stripe.com");
	return location!;
};

export const getStripeSessionId = (url: string) => {
	const sessionId = url.match(STRIPE_SESSION_ID_REGEX)?.[0];
	if (!sessionId) throw new Error(`Expected Stripe checkout URL: ${url}`);
	return sessionId;
};

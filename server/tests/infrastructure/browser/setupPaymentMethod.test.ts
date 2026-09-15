import { expect, test } from "bun:test";
import Stripe from "stripe";
import { waitForSetupPaymentMethod } from "../../utils/browserPool/waitForSetupPaymentMethod";

const checkoutUrl = "https://checkout.stripe.com/c/pay/cs_test_fixture";

test("setup completion waits for the webhook's default payment method", async () => {
	const readCustomer = Promise.withResolvers<void>();
	let applied = false;
	const stripeCli = new Stripe("sk_test_fixture", {
		maxNetworkRetries: 0,
		httpClient: Stripe.createFetchHttpClient(async (url: RequestInfo | URL) => {
			const customer = {
				id: "cus_fixture",
				object: "customer",
				invoice_settings: {
					default_payment_method: applied ? "pm_fixture" : null,
				},
			};
			if (String(url).includes("checkout/sessions"))
				return Response.json({ id: "cs_test_fixture", customer });
			readCustomer.resolve();
			return Response.json(customer);
		}),
	});
	let completed = false;
	const completion = waitForSetupPaymentMethod({
		ctx: { stripeCli },
		url: checkoutUrl,
	}).then(() => {
		completed = true;
	});
	await readCustomer.promise;
	expect(completed).toBe(false);
	applied = true;
	await completion;
	expect(completed).toBe(true);
});

test("an applied default returns after one read without waiting", async () => {
	let reads = 0;
	const stripeCli = new Stripe("sk_test_fixture", {
		maxNetworkRetries: 0,
		httpClient: Stripe.createFetchHttpClient(async () => {
			reads++;
			return Response.json({
				id: "cs_test_fixture",
				customer: {
					id: "cus_fixture",
					invoice_settings: { default_payment_method: "pm_fixture" },
				},
			});
		}),
	});
	await waitForSetupPaymentMethod({ ctx: { stripeCli }, url: checkoutUrl });
	expect(reads).toBe(1);
});

test("a confirmed checkout without an applied default fails explicitly", async () => {
	const stripeCli = new Stripe("sk_test_fixture", {
		maxNetworkRetries: 0,
		httpClient: Stripe.createFetchHttpClient(async () =>
			Response.json({
				id: "cs_test_fixture",
				customer: {
					id: "cus_fixture",
					invoice_settings: { default_payment_method: null },
				},
			}),
		),
	});
	await expect(
		waitForSetupPaymentMethod({
			ctx: { stripeCli },
			url: checkoutUrl,
			timeoutMs: 0,
		}),
	).rejects.toThrow("still has no default payment method");
});

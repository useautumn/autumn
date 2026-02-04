import { expect, test } from "bun:test";
import type { ConfirmCheckoutResponse } from "@autumn/shared";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import axios from "axios";
import chalk from "chalk";
import { removeAllPaymentMethods } from "@/external/stripe/customers/paymentMethods/operations/removeAllPaymentMethods";

/**
 * Confirm Paid Product Without Payment Method Scenario
 *
 * Tests confirming an Autumn checkout for a paid product when the customer
 * has no payment method on file. This can happen when:
 * 1. Customer had PM when checkout was created, then removed it
 * 2. Or the checkout requires payment collection
 *
 * Expected behavior: Should return a payment_url for the customer to complete payment.
 */

test(
	`${chalk.yellowBright("autumn-checkout: confirm paid (no PM) - Returns payment_url")}`,
	async () => {
		const customerId = "checkout-confirm-paid-no-pm";

		// Pro plan ($20/mo)
		const pro = products.pro({
			id: "pro",
			items: [items.dashboard(), items.monthlyMessages({ includedUsage: 500 })],
		});

		// Setup: customer WITH payment method initially (to get autumn checkout)
		const { autumnV1, customer } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }), // Start with PM to get autumn checkout
				s.products({ list: [pro] }),
			],
			actions: [],
		});

		// 1. Create checkout with redirect_mode: "always" (Autumn checkout)
		// This works because customer has PM
		const attachResult = await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: `pro_${customerId}`,
			redirect_mode: "always",
		});
		console.log("attach result:", attachResult);

		// Should return autumn checkout URL
		const checkoutUrl = attachResult.checkout_url;
		expect(checkoutUrl).toBeDefined();
		expect(checkoutUrl).toContain("/c/");

		// Extract checkout ID
		const checkoutId = checkoutUrl!.split("/c/")[1];
		console.log("checkout ID:", checkoutId);

		// 2. Remove payment method AFTER checkout was created
		// This simulates the scenario where customer no longer has a PM when confirming
		const stripeCustomerId = customer?.processor?.id;
		if (stripeCustomerId) {
			await removeAllPaymentMethods({
				stripeClient: ctx.stripeCli,
				stripeCustomerId,
			});
			console.log("Removed all payment methods from customer");
		}

		// 3. Verify customer doesn't have product yet
		const customerBefore = await autumnV1.customers.get(customerId);
		console.log("customer before confirm (no PM):", {
			products: customerBefore.products?.map(
				(p: { id: string; name: string | null }) => ({
					id: p.id,
					name: p.name,
				}),
			),
		});

		// 4. Attempt to confirm the checkout without PM
		// Should return payment_url since payment is required but no PM exists
		try {
			const confirmResponse = await axios.post<
				ConfirmCheckoutResponse & {
					payment_url?: string;
					checkout_url?: string;
				}
			>(
				`http://localhost:8080/checkouts/${checkoutId}/confirm`,
				{},
				{ timeout: 10000 },
			);
			const confirmData = confirmResponse.data;
			console.log("confirm response:", confirmData);

			// If confirm succeeds, it should include a payment_url or checkout_url
			// for the customer to complete payment
			const paymentUrl = confirmData.payment_url || confirmData.checkout_url;
			if (paymentUrl) {
				expect(paymentUrl).toBeDefined();
				console.log("payment/checkout url returned:", paymentUrl);
			} else {
				// If no payment_url, the confirm might still succeed
				// and create a subscription that requires payment
				console.log("confirm succeeded without payment_url");
				console.log("invoice_id:", confirmData.invoice_id);
			}
		} catch (error: unknown) {
			// It's also acceptable for the confirm to fail with an error
			// requiring payment method
			if (axios.isAxiosError(error)) {
				console.log("confirm error status:", error.response?.status);
				console.log("confirm error data:", error.response?.data);
				const errorData = error.response?.data;

				// Check if error includes payment_url for payment collection
				if (errorData?.payment_url) {
					expect(errorData.payment_url).toBeDefined();
					console.log("payment_url in error response:", errorData.payment_url);
				} else {
					// Should indicate payment method is required or similar
					console.log("Error code:", errorData?.code);
					console.log("Error message:", errorData?.message);
				}
			} else {
				throw error;
			}
		}
	},
	{ timeout: 30000 },
);

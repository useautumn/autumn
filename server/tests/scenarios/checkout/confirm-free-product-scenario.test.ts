import { expect, test } from "bun:test";
import type { ConfirmCheckoutResponse } from "@autumn/shared";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import axios from "axios";
import chalk from "chalk";

/**
 * Confirm Free Product Scenario
 *
 * Tests confirming an Autumn checkout for a free product.
 * When a customer confirms a free product checkout, no payment is needed.
 * The product should be attached immediately with success.
 */

test(
	`${chalk.yellowBright("autumn-checkout: confirm free product - No payment needed")}`,
	async () => {
		const customerId = "checkout-confirm-free";

		// Free plan - dashboard access only, no price
		const free = products.base({
			id: "free",
			items: [items.dashboard(), items.monthlyMessages({ includedUsage: 100 })],
		});

		// Setup: customer without payment method
		const { autumnV1 } = await initScenario({
			customerId,
			setup: [
				s.customer({}), // No payment method
				s.products({ list: [free] }),
			],
			actions: [],
		});

		// 1. Create checkout with redirect_mode: "always" (Autumn checkout)
		const attachResult = await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: `free_${customerId}`,
			redirect_mode: "always",
		});
		console.log("attach result:", attachResult);

		// Should return autumn checkout URL (contains /c/)
		const checkoutUrl = attachResult.checkout_url;
		expect(checkoutUrl).toBeDefined();
		expect(checkoutUrl).toContain("/c/");

		// Extract checkout ID from URL
		const checkoutId = checkoutUrl!.split("/c/")[1];
		console.log("checkout ID:", checkoutId);

		// 2. Verify customer doesn't have product yet
		const customerBefore = await autumnV1.customers.get(customerId);
		console.log("customer before confirm:", {
			products: customerBefore.products?.map(
				(p: { id: string; name: string | null }) => ({
					id: p.id,
					name: p.name,
				}),
			),
		});

		// 3. Confirm the checkout - should succeed without payment
		const confirmResponse = await axios.post<ConfirmCheckoutResponse>(
			`http://localhost:8080/checkouts/${checkoutId}/confirm`,
			{},
			{ timeout: 10000 },
		);
		const confirmData = confirmResponse.data;
		console.log("confirm response:", confirmData);

		// Assertions for free product confirmation
		expect(confirmData.success).toBe(true);
		expect(confirmData.checkout_id).toBe(checkoutId);
		expect(confirmData.customer_id).toBe(customerId);
		expect(confirmData.product_id).toContain("free");
		// Free product should NOT create an invoice
		expect(confirmData.invoice_id).toBeNull();

		// 4. Verify product is now attached
		const customerAfter = await autumnV1.customers.get(customerId);
		console.log("customer after confirm:", {
			products: customerAfter.products?.map(
				(p: { id: string; name: string | null }) => ({
					id: p.id,
					name: p.name,
				}),
			),
		});

		const attachedProduct = customerAfter.products?.find((p: { id: string }) =>
			p.id.includes("free"),
		);
		expect(attachedProduct).toBeDefined();
	},
	{ timeout: 30000 },
);

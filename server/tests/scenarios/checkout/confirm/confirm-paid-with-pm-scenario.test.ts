import { expect, test } from "bun:test";
import type { ConfirmCheckoutResponse } from "@autumn/shared";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import axios from "axios";
import chalk from "chalk";

/**
 * Confirm Paid Product With Payment Method Scenario
 *
 * Tests confirming an Autumn checkout for a paid product when the customer
 * has a valid payment method on file.
 *
 * Expected behavior: Invoice is created and payment is processed immediately.
 */

test(
	`${chalk.yellowBright("autumn-checkout: confirm paid (with PM) - Invoice created")}`,
	async () => {
		const customerId = "checkout-confirm-paid-with-pm";

		// Pro plan ($20/mo)
		const pro = products.pro({
			id: "pro",
			items: [items.dashboard(), items.monthlyMessages({ includedUsage: 500 })],
		});

		// Setup: customer WITH payment method
		const { autumnV1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }), // Has valid PM
				s.products({ list: [pro] }),
			],
			actions: [],
		});

		// 1. Create checkout with redirect_mode: "always" (Autumn checkout)
		const attachResult = await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: `pro_${customerId}`,
			redirect_mode: "always",
		});
		console.log("attach result:", attachResult);

		// Should return autumn checkout URL (not stripe checkout)
		const checkoutUrl = attachResult.checkout_url;
		expect(checkoutUrl).toBeDefined();
		expect(checkoutUrl).toContain("/c/");

		// Extract checkout ID
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

		// 3. Confirm the checkout - should create invoice and charge PM
		const confirmResponse = await axios.post<ConfirmCheckoutResponse>(
			`http://localhost:8080/checkouts/${checkoutId}/confirm`,
			{},
			{ timeout: 15000 },
		);
		const confirmData = confirmResponse.data;
		console.log("confirm response:", confirmData);

		// Assertions for paid product with PM
		expect(confirmData.success).toBe(true);
		expect(confirmData.checkout_id).toBe(checkoutId);
		expect(confirmData.customer_id).toBe(customerId);
		expect(confirmData.product_id).toContain("pro");
		// Paid product WITH PM should create an invoice
		expect(confirmData.invoice_id).toBeDefined();
		expect(confirmData.invoice_id).not.toBeNull();
		console.log("invoice created:", confirmData.invoice_id);

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
			p.id.includes("pro"),
		);
		expect(attachedProduct).toBeDefined();

		// 5. Verify invoice exists in customer's invoices
		const invoices = customerAfter.invoices;
		console.log(
			"customer invoices:",
			invoices?.map((i: { id: string; status: string; total: number }) => ({
				id: i.id,
				status: i.status,
				total: i.total,
			})),
		);

		const matchingInvoice = invoices?.find(
			(i: { id: string }) => i.id === confirmData.invoice_id,
		);
		expect(matchingInvoice).toBeDefined();
	},
	{ timeout: 30000 },
);

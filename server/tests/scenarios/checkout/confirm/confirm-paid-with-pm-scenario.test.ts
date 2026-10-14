import { expect, test } from "bun:test";
import type { ConfirmCheckoutResponse } from "@autumn/shared";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import axios from "axios";
import chalk from "chalk";

test(
	`${chalk.yellowBright("autumn-checkout: confirm paid (with PM) - Invoice created")}`,
	async () => {
		const customerId = "checkout-confirm-paid-with-pm";

		const starter = products.base({
			id: "starter",
			items: [items.dashboard(), items.monthlyPrice({ price: 10 })],
		});

		const pro = products.pro({
			id: "pro",
			items: [items.dashboard(), items.monthlyMessages({ includedUsage: 500 })],
		});

		const { autumnV1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [starter, pro] }),
			],
			actions: [s.attach({ productId: starter.id })],
		});

		const attachResult = await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: `pro_${customerId}`,
			redirect_mode: "always",
		});
		console.log("attach result:", attachResult);

		const checkoutUrl = attachResult.payment_url;
		expect(checkoutUrl).toBeDefined();
		expect(checkoutUrl).toContain("/c/");

		const checkoutId = checkoutUrl!.split("/c/")[1];
		console.log("checkout ID:", checkoutId);

		const customerBefore = await autumnV1.customers.get(customerId);
		console.log("customer before confirm:", {
			products: customerBefore.products?.map(
				(p: { id: string; name: string | null }) => ({
					id: p.id,
					name: p.name,
				}),
			),
		});

		const confirmResponse = await axios.post<ConfirmCheckoutResponse>(
			`${process.env.AUTUMN_TEST_BASE_URL ?? "http://localhost:8080"}/checkouts/${checkoutId}/confirm`,
			{},
			{ timeout: 15000 },
		);
		const confirmData = confirmResponse.data;
		console.log("confirm response:", confirmData);

		expect(confirmData.success).toBe(true);
		expect(confirmData.checkout_id).toBe(checkoutId);
		expect(confirmData.customer_id).toBe(customerId);
		expect(confirmData.product_id).toContain("pro");
		expect(confirmData.invoice_id).toBeDefined();
		expect(confirmData.invoice_id).not.toBeNull();
		console.log("invoice created:", confirmData.invoice_id);

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

		const invoices = customerAfter.invoices;
		console.log(
			"customer invoices:",
			invoices?.map(
				(i: { stripe_id: string; status: string; total: number }) => ({
					stripe_id: i.stripe_id,
					status: i.status,
					total: i.total,
				}),
			),
		);

		const matchingInvoice = invoices?.find(
			(i: { stripe_id: string }) => i.stripe_id === confirmData.invoice_id,
		);
		expect(matchingInvoice).toBeDefined();
	},
	{ timeout: 60000 },
);

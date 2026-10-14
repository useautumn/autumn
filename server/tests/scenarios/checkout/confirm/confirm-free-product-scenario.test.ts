import { expect, test } from "bun:test";
import type { ConfirmCheckoutResponse } from "@autumn/shared";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import axios from "axios";
import chalk from "chalk";

test(
	`${chalk.yellowBright("autumn-checkout: confirm free product - No payment needed")}`,
	async () => {
		const customerId = "checkout-confirm-free";

		const free = products.base({
			id: "free",
			items: [items.dashboard(), items.monthlyMessages({ includedUsage: 100 })],
		});

		const { autumnV1 } = await initScenario({
			customerId,
			setup: [s.customer({}), s.products({ list: [free] })],
			actions: [],
		});

		const attachResult = await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: `free_${customerId}`,
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
			{ timeout: 10000 },
		);
		const confirmData = confirmResponse.data;
		console.log("confirm response:", confirmData);

		expect(confirmData.success).toBe(true);
		expect(confirmData.checkout_id).toBe(checkoutId);
		expect(confirmData.customer_id).toBe(customerId);
		expect(confirmData.product_id).toContain("free");
		expect(confirmData.invoice_id).toBeNull();

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

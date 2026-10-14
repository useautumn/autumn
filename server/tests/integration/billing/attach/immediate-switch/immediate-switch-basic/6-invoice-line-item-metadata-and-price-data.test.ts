import { expect, test } from "bun:test";
import { type ApiCustomerV3, atmnToStripeAmount } from "@autumn/shared";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test.concurrent(
	`${chalk.yellowBright("immediate-switch-basic 6: invoice line item metadata and price_data")}`,
	async () => {
		const customerId = "imm-switch-metadata-price-data";

		const proMessagesItem = items.monthlyMessages({ includedUsage: 500 });
		const pro = products.pro({
			id: "pro",
			items: [proMessagesItem],
		});

		const premiumMessagesItem = items.monthlyMessages({ includedUsage: 1000 });
		const premium = products.premium({
			id: "premium",
			items: [premiumMessagesItem],
		});

		const { autumnV1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, premium] }),
			],
			actions: [s.billing.attach({ productId: pro.id })],
		});

		const result = await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: premium.id,
			redirect_mode: "if_required",
		});

		expect(result.invoice).toBeDefined();
		expect(result.invoice!.stripe_id).toBeDefined();

		const stripeInvoice = await ctx.stripeCli.invoices.retrieve(
			result.invoice!.stripe_id,
			{ expand: ["lines.data"] },
		);

		expect(stripeInvoice.lines.data.length).toBeGreaterThan(0);

		for (const lineItem of stripeInvoice.lines.data) {
			const metadata = lineItem.metadata;

			expect(metadata).toBeDefined();
			expect(metadata?.autumn_product_id).toBeDefined();
			expect(metadata?.autumn_price_id).toBeDefined();

			if (lineItem.amount > 0 && metadata?.stripe_product_id) {
				expect(lineItem.pricing?.price_details).toBeDefined();
				expect(lineItem.pricing?.price_details?.product).toBe(
					metadata.stripe_product_id,
				);
			}
		}

		expect(stripeInvoice.total).toBe(
			atmnToStripeAmount({ amount: 30, currency: "usd" }),
		);

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

		await expectCustomerProducts({
			customer,
			active: [premium.id],
			notPresent: [pro.id],
		});
	},
);

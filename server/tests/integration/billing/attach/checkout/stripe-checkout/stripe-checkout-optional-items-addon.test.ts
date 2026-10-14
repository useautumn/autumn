import { expect, test } from "bun:test";
import type { ApiCustomerV3, AttachParamsV1Input } from "@autumn/shared";
import { expectProductActive } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { completeStripeCheckoutFormV2 as completeStripeCheckoutForm } from "@tests/utils/browserPool/completeStripeCheckoutFormV2";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { timeout } from "@tests/utils/genUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { ProductService } from "@/internal/products/ProductService";

test.concurrent(
	`${chalk.yellowBright("checkout optional_items: purchased add-on is provisioned")}`,
	async () => {
		const customerId = `checkout-optional-item-addon-${Date.now()}`;

		const pro = products.pro({
			id: "pro-optional-item",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const unfairAdvantage = products.oneOffAddOn({
			id: "unfair-advantage",
			items: [items.dashboard()],
		});

		const { autumnV1, autumnV2_1, ctx } = await initScenario({
			customerId,
			setup: [
				s.deleteCustomer({ customerId }),
				s.customer({ testClock: true }),
				s.products({ list: [pro, unfairAdvantage] }),
			],
			actions: [],
		});

		const fullAddOn = await ProductService.getFull({
			db: ctx.db,
			orgId: ctx.org.id,
			env: ctx.env,
			idOrInternalId: unfairAdvantage.id,
		});
		const addOnStripePriceId = fullAddOn?.prices[0]?.config?.stripe_price_id as
			| string
			| undefined;
		expect(addOnStripePriceId).toBeDefined();

		const result = await autumnV2_1.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: pro.id,
			checkout_session_params: {
				optional_items: [{ price: addOnStripePriceId, quantity: 1 }],
			},
		});

		expect(result.payment_url).toBeDefined();
		expect(result.payment_url).toContain("checkout.stripe.com");

		await completeStripeCheckoutForm({
			url: result.payment_url,
			addOptionalItem: true,
		});
		await timeout(15000);

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

		await expectProductActive({ customer, productId: pro.id });

		await expectProductActive({ customer, productId: unfairAdvantage.id });

		const dashboardFeature = customer.features?.[TestFeature.Dashboard];
		expect(dashboardFeature).toBeDefined();

		const latestInvoice = customer.invoices?.[0];
		expect(latestInvoice?.product_ids?.length).toBe(2);
	},
);

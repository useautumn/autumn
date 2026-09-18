/**
 * invoices.create — catalog plan lines, each in isolation.
 *
 * Every test also asserts the customer gained no plan: an invoice is a bill,
 * not an attach.
 */

import { expect, test } from "bun:test";
import {
	type ApiCustomerV5,
	BillingInterval,
	BillingMethod,
} from "@autumn/shared";
import { expectProductNotPresent } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import {
	createInvoice,
	expectCreatedInvoiceCorrect,
} from "./utils/expectCreatedInvoiceCorrect";

// products.pro() carries a $20/month base price.
const PRO_BASE = 20;

test.concurrent(
	`${chalk.yellowBright("invoices.create: plan only bills the base price")}`,
	async () => {
		const customerId = "inv-create-base";
		const pro = products.pro({ id: "pro-create-base", items: [] });
		const { ctx, autumnV2_3 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [],
		});

		const response = await createInvoice({
			autumnV2_3,
			params: {
				customer_id: customerId,
				plans: [{ plan_id: pro.id }],
				net_terms_days: 14,
			},
		});

		await expectCreatedInvoiceCorrect({
			ctx,
			response,
			lines: [{ amount: PRO_BASE, quantity: null, prorated: false }],
			total: PRO_BASE,
			dueInDays: 14,
		});
		const customer = await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
		await expectProductNotPresent({ customer, productId: pro.id });
	},
);

test.concurrent(
	`${chalk.yellowBright("invoices.create: prepaid quantity bills units × unit price")}`,
	async () => {
		const customerId = "inv-create-prepaid";
		// prepaidUsers: $10 per user, billing_units 1
		const pro = products.pro({
			id: "pro-create-prepaid",
			items: [items.prepaidUsers()],
		});
		const { ctx, autumnV2_3 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [],
		});

		const response = await createInvoice({
			autumnV2_3,
			params: {
				customer_id: customerId,
				plans: [
					{
						plan_id: pro.id,
						feature_quantities: [
							{
								feature_id: TestFeature.Users,
								billing_behavior: BillingMethod.Prepaid,
								quantity: 5,
							},
						],
					},
				],
			},
		});

		await expectCreatedInvoiceCorrect({
			ctx,
			response,
			lines: [
				{ amount: PRO_BASE, quantity: null },
				{ amount: 50, quantity: 5 },
			],
			total: PRO_BASE + 50,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("invoices.create: usage quantity bills through the consumable price without touching balances")}`,
	async () => {
		const customerId = "inv-create-usage";
		// consumableMessages: $0.1 per message, 100 included on the plan — included usage is NOT subtracted here.
		const pro = products.pro({
			id: "pro-create-usage",
			items: [items.consumableMessages({ includedUsage: 100 })],
		});
		const { ctx, autumnV2_3 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [],
		});

		const response = await createInvoice({
			autumnV2_3,
			params: {
				customer_id: customerId,
				plans: [
					{
						plan_id: pro.id,
						customize: { price: null },
						feature_quantities: [
							{
								feature_id: TestFeature.Messages,
								billing_behavior: BillingMethod.UsageBased,
								quantity: 2500,
							},
						],
					},
				],
			},
		});

		await expectCreatedInvoiceCorrect({
			ctx,
			response,
			lines: [{ amount: 250, quantity: 2500, prorated: false }],
			total: 250,
		});
		const customer = await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
		expect(customer.balances?.[TestFeature.Messages]).toBeUndefined();
	},
);

test.concurrent(
	`${chalk.yellowBright("invoices.create: customize.price 0 omits the base line")}`,
	async () => {
		const customerId = "inv-create-omit-base";
		const pro = products.pro({
			id: "pro-create-omit",
			items: [items.prepaidUsers()],
		});
		const { ctx, autumnV2_3 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [],
		});

		const response = await createInvoice({
			autumnV2_3,
			params: {
				customer_id: customerId,
				plans: [
					{
						plan_id: pro.id,
						customize: {
							price: { amount: 0, interval: BillingInterval.Month },
						},
						feature_quantities: [
							{
								feature_id: TestFeature.Users,
								billing_behavior: BillingMethod.Prepaid,
								quantity: 2,
							},
						],
					},
				],
			},
		});

		await expectCreatedInvoiceCorrect({
			ctx,
			response,
			lines: [{ amount: 20, quantity: 2 }],
			total: 20,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("invoices.create: custom line items only, no plan")}`,
	async () => {
		const customerId = "inv-create-custom";
		const { ctx, autumnV2_3 } = await initScenario({
			customerId,
			setup: [s.customer({ paymentMethod: "success" })],
			actions: [],
		});

		const response = await createInvoice({
			autumnV2_3,
			params: {
				customer_id: customerId,
				custom_line_items: [
					{ description: "Implementation services", amount: 500 },
					{ description: "Data migration", amount: 250 },
				],
			},
		});

		const { invoice } = await expectCreatedInvoiceCorrect({
			ctx,
			response,
			lines: [
				{ description: "Implementation services", amount: 500 },
				{ description: "Data migration", amount: 250 },
			],
			total: 750,
		});
		expect(invoice.plan_ids).toEqual([]);
	},
);

test.concurrent(
	`${chalk.yellowBright("invoices.create: preview returns totals and creates nothing")}`,
	async () => {
		const customerId = "inv-create-preview";
		const pro = products.pro({
			id: "pro-create-preview",
			items: [items.prepaidUsers()],
		});
		const { autumnV2_3 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [],
		});

		const { invoice, preview } = await createInvoice({
			autumnV2_3,
			params: {
				customer_id: customerId,
				preview: true,
				plans: [
					{
						plan_id: pro.id,
						feature_quantities: [
							{
								feature_id: TestFeature.Users,
								billing_behavior: BillingMethod.Prepaid,
								quantity: 3,
							},
						],
					},
				],
				custom_line_items: [{ description: "Onboarding", amount: 100 }],
			},
		});

		expect(invoice).toBeNull();
		expect(preview.lines.map((line) => line.amount)).toEqual([
			PRO_BASE,
			30,
			100,
		]);
		expect(preview.subtotal).toBe(150);
		expect(preview.total).toBe(150);

		const { list } = (await autumnV2_3.post("/invoices.list", {
			customer_id: customerId,
		})) as {
			list: unknown[];
		};
		expect(list).toEqual([]);
	},
);

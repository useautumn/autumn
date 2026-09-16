/**
 * invoices.create — pricing modifiers: discounts, proration, tax, template,
 * licenses, credit usage, multiple plans.
 */

import { expect, test } from "bun:test";
import {
	type ApiCustomerV5,
	BillingInterval,
	BillingMethod,
} from "@autumn/shared";
import { createPercentCoupon } from "@tests/integration/billing/utils/discounts/discountTestUtils";
import { expectProductNotPresent } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { InvoiceTemplateService } from "@/internal/orgs/invoiceTemplates/InvoiceTemplateService";
import { generateId } from "@/utils/genUtils";
import {
	createInvoice,
	expectCreatedInvoiceCorrect,
} from "./utils/expectCreatedInvoiceCorrect";

const PRO_BASE = 20;

test.concurrent(
	`${chalk.yellowBright("invoices.create: invoice discount applies to everything, plan discount only to its plan")}`,
	async () => {
		const customerId = "inv-create-discounts";
		const pro = products.pro({
			id: "pro-create-disc",
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
		const [planCoupon, invoiceCoupon] = await Promise.all([
			createPercentCoupon({ stripeCli: ctx.stripeCli, percentOff: 50 }),
			ctx.stripeCli.coupons.create({
				amount_off: 1000,
				currency: "usd",
				duration: "once",
			}),
		]);

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
								quantity: 4,
							},
						],
						discounts: [{ reward_id: planCoupon.id }],
					},
				],
				custom_line_items: [{ description: "Setup fee", amount: 100 }],
				discounts: [{ reward_id: invoiceCoupon.id }],
			},
		});

		// plan lines: (20 + 40) × 50% = 30; custom 100 untouched by the plan coupon; $10 off the invoice.
		const { stripeInvoice } = await expectCreatedInvoiceCorrect({
			ctx,
			response,
			lines: [
				{ amount: PRO_BASE, quantity: null },
				{ amount: 40, quantity: 4 },
				{ amount: 100 },
			],
			total: 30 + 100 - 10,
			stripeDiscountTotal: 30 + 10,
		});
		expect(response.preview.discount_total).toBe(40);
		// Everything a line was discounted beyond the invoice-wide coupon.
		const idOf = (discount: string | { id: string }) =>
			typeof discount === "string" ? discount : discount.id;
		const invoiceDiscountIds = stripeInvoice.discounts.map(idOf);
		const planCouponAmounts = stripeInvoice.lines.data.map((line) =>
			(line.discount_amounts ?? [])
				.filter((entry) => !invoiceDiscountIds.includes(idOf(entry.discount)))
				.reduce((sum, entry) => sum + entry.amount, 0),
		);
		expect(planCouponAmounts).toEqual([1000, 2000, 0]);
	},
);

test.concurrent(
	`${chalk.yellowBright("invoices.create: fixed plan discount over two lines is refused")}`,
	async () => {
		const customerId = "inv-create-fixed-disc";
		const pro = products.pro({
			id: "pro-create-fixed-disc",
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
		const coupon = await ctx.stripeCli.coupons.create({
			amount_off: 500,
			currency: "usd",
			duration: "once",
		});

		await expectAutumnError({
			errMessage: "Apply it at the invoice level",
			func: () =>
				createInvoice({
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
										quantity: 1,
									},
								],
								discounts: [{ reward_id: coupon.id }],
							},
						],
					},
				}),
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("invoices.create: period prorates base and prepaid, not usage")}`,
	async () => {
		const customerId = "inv-create-proration";
		const pro = products.pro({
			id: "pro-create-prorate",
			items: [items.prepaidUsers(), items.consumableMessages()],
		});
		const { ctx, autumnV2_3 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [],
		});

		// Sep 1 → Sep 16 UTC is 15 of 30 days of the monthly cycle starting Sep 1.
		const periodStart = Date.UTC(2026, 8, 1);
		const periodEnd = Date.UTC(2026, 8, 16);
		const response = await createInvoice({
			autumnV2_3,
			params: {
				customer_id: customerId,
				period_start: periodStart,
				period_end: periodEnd,
				plans: [
					{
						plan_id: pro.id,
						feature_quantities: [
							{
								feature_id: TestFeature.Users,
								billing_behavior: BillingMethod.Prepaid,
								quantity: 2,
							},
							{
								feature_id: TestFeature.Messages,
								billing_behavior: BillingMethod.UsageBased,
								quantity: 100,
							},
						],
					},
				],
			},
		});

		const { stripeInvoice } = await expectCreatedInvoiceCorrect({
			ctx,
			response,
			lines: [
				{ amount: 10, prorated: true },
				{ amount: 10, quantity: 2, prorated: true },
				{ amount: 10, quantity: 100, prorated: false },
			],
			total: 30,
		});
		for (const line of response.preview.lines) {
			expect(line.period_start).toBe(periodStart);
			expect(line.period_end).toBe(periodEnd);
		}
		for (const line of stripeInvoice.lines.data) {
			expect(line.period.start * 1000).toBe(periodStart);
			expect(line.period.end * 1000).toBe(periodEnd);
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("invoices.create: multi-cycle period bills whole cycles plus a prorated tail")}`,
	async () => {
		const customerId = "inv-create-multicycle";
		const pro = products.pro({ id: "pro-create-multicycle", items: [] });
		const { ctx, autumnV2_3 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [],
		});

		// Sep 1 → Nov 15: Sep + Oct whole, then 14 of 30 November days.
		const response = await createInvoice({
			autumnV2_3,
			params: {
				customer_id: customerId,
				period_start: Date.UTC(2026, 8, 1),
				period_end: Date.UTC(2026, 10, 15),
				plans: [{ plan_id: pro.id }],
			},
		});

		const expected = 2 * PRO_BASE + (14 / 30) * PRO_BASE;
		await expectCreatedInvoiceCorrect({
			ctx,
			response,
			lines: [{ amount: expected, prorated: true }],
			total: expected,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("invoices.create: prorate false on the plan bills the full base")}`,
	async () => {
		const customerId = "inv-create-no-prorate";
		const pro = products.pro({ id: "pro-create-no-prorate", items: [] });
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
				period_start: Date.UTC(2026, 8, 1),
				period_end: Date.UTC(2026, 8, 16),
				plans: [{ plan_id: pro.id, prorate: false }],
			},
		});

		await expectCreatedInvoiceCorrect({
			ctx,
			response,
			lines: [{ amount: PRO_BASE, prorated: false }],
			total: PRO_BASE,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("invoices.create: tax_rate_id adds exclusive tax to the total")}`,
	async () => {
		const customerId = "inv-create-tax";
		const pro = products.pro({ id: "pro-create-tax", items: [] });
		const { ctx, autumnV2_3 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [],
		});
		const taxRate = await ctx.stripeCli.taxRates.create({
			display_name: "Test Tax",
			percentage: 10,
			inclusive: false,
		});

		const response = await createInvoice({
			autumnV2_3,
			params: {
				customer_id: customerId,
				plans: [{ plan_id: pro.id }],
				tax_rate_id: taxRate.id,
			},
		});

		const { stripeInvoice } = await expectCreatedInvoiceCorrect({
			ctx,
			response,
			lines: [{ amount: PRO_BASE }],
			total: 22,
		});
		expect(response.preview.tax).toMatchObject({
			total: 2,
			amount_exclusive: 2,
		});
		expect(stripeInvoice.default_tax_rates.map((rate) => rate.id)).toEqual([
			taxRate.id,
		]);
		expect(stripeInvoice.automatic_tax.enabled).toBe(false);
	},
);

test.concurrent(
	`${chalk.yellowBright("invoices.create: template supplies footer, memo and net terms")}`,
	async () => {
		const customerId = "inv-create-template";
		const pro = products.pro({ id: "pro-create-template", items: [] });
		const { ctx, autumnV2_3 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [],
		});
		const templateId = `tmpl_${generateId("create")}`;
		await InvoiceTemplateService.create({
			db: ctx.db,
			orgId: ctx.org.id,
			internalId: generateId("inv_tmpl_int"),
			id: templateId,
			values: {
				name: "Wire",
				footer: "Pay by wire within terms",
				memo: "Thanks for your business",
				net_terms_days: 45,
			},
		});

		const response = await createInvoice({
			autumnV2_3,
			params: {
				customer_id: customerId,
				plans: [{ plan_id: pro.id }],
				invoice_template_id: templateId,
			},
		});

		const { stripeInvoice } = await expectCreatedInvoiceCorrect({
			ctx,
			response,
			lines: [{ amount: PRO_BASE }],
			total: PRO_BASE,
			footer: "Pay by wire within terms",
			dueInDays: 45,
		});
		expect(stripeInvoice.description).toBe("Thanks for your business");
		expect(response.preview.due_date).toBe(stripeInvoice.due_date! * 1000);
	},
);

test.concurrent(
	`${chalk.yellowBright("invoices.create: license seats bill through the license plan without creating a license row")}`,
	async () => {
		const customerId = "inv-create-license";
		const parent = products.pro({ id: "pro-create-lic-parent", items: [] });
		// products.base has no base price; give the seat plan a $15/month price.
		const seat = products.base({
			id: "pro-create-lic-seat",
			items: [
				items.monthlyPrice({ price: 15 }),
				items.monthlyMessages({ includedUsage: 10 }),
			],
		});
		const { ctx, autumnV2_3 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [parent, seat] }),
			],
			actions: [
				s.licenses.link({
					parentProductId: parent.id,
					licenseProductId: seat.id,
					included: 1,
				}),
			],
		});

		const response = await createInvoice({
			autumnV2_3,
			params: {
				customer_id: customerId,
				plans: [
					{
						plan_id: parent.id,
						license_quantities: [{ license_plan_id: seat.id, quantity: 3 }],
					},
				],
			},
		});

		const { invoice } = await expectCreatedInvoiceCorrect({
			ctx,
			response,
			lines: [
				{ amount: PRO_BASE, quantity: null },
				{ amount: 45, quantity: 3 },
			],
			total: 65,
		});
		expect(response.preview.lines[1].plan_id).toBe(seat.id);
		expect(invoice.plan_ids.sort()).toEqual([parent.id, seat.id].sort());

		const customer = await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
		await expectProductNotPresent({ customer, productId: parent.id });
		await expectProductNotPresent({ customer, productId: seat.id });
	},
);

test.concurrent(
	`${chalk.yellowBright("invoices.create: license customize price overrides the seat price")}`,
	async () => {
		const customerId = "inv-create-license-custom";
		const parent = products.pro({
			id: "pro-create-lic-custom-parent",
			items: [],
		});
		const seat = products.base({
			id: "pro-create-lic-custom-seat",
			items: [items.monthlyPrice({ price: 15 })],
		});
		const { ctx, autumnV2_3 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [parent, seat] }),
			],
			actions: [
				s.licenses.link({
					parentProductId: parent.id,
					licenseProductId: seat.id,
					included: 0,
				}),
			],
		});

		const response = await createInvoice({
			autumnV2_3,
			params: {
				customer_id: customerId,
				plans: [
					{
						plan_id: parent.id,
						customize: { price: null },
						license_quantities: [
							{
								license_plan_id: seat.id,
								quantity: 2,
								customize: {
									price: { amount: 12.5, interval: BillingInterval.Month },
								},
							},
						],
					},
				],
			},
		});

		await expectCreatedInvoiceCorrect({
			ctx,
			response,
			lines: [{ amount: 25, quantity: 2 }],
			total: 25,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("invoices.create: usage entries convert through the credit rate card then the credit price")}`,
	async () => {
		const customerId = "inv-create-credit-usage";
		// consumable credits at $0.5 per credit; Action1 costs 0.2 credits, Action2 costs 0.6.
		const pro = products.pro({
			id: "pro-create-credit-usage",
			items: [items.consumable({ featureId: TestFeature.Credits, price: 0.5 })],
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
								feature_id: TestFeature.Credits,
								billing_behavior: BillingMethod.UsageBased,
								usage: [
									{ feature_id: TestFeature.Action1, quantity: 100 },
									{ feature_id: TestFeature.Action2, quantity: 50 },
								],
							},
						],
					},
				],
			},
		});

		// 100 × 0.2 + 50 × 0.6 = 50 credits × $0.5 = $25
		await expectCreatedInvoiceCorrect({
			ctx,
			response,
			lines: [{ amount: 25, quantity: 50 }],
			total: 25,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("invoices.create: dimension credits pick the rate card dimension and multiplier")}`,
	async () => {
		const customerId = "inv-create-dimension-credits";
		// DimensionCredits is an invoice-credit system: credits are already dollars.
		const pro = products.pro({
			id: "pro-create-dim-credits",
			items: [
				items.consumable({ featureId: TestFeature.DimensionCredits, price: 1 }),
			],
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
								feature_id: TestFeature.DimensionCredits,
								billing_behavior: BillingMethod.UsageBased,
								usage: [
									{
										feature_id: TestFeature.DimensionAction,
										quantity: 2,
										properties: { size: "large" },
									},
									{
										feature_id: TestFeature.DimensionAction,
										quantity: 1,
										properties: {
											size: "large",
											region: "eu",
											lifecycle: "spot",
										},
									},
									{ feature_id: TestFeature.DimensionAction, quantity: 3 },
								],
							},
						],
					},
				],
			},
		});

		// 2 × 16 + 1 × 20 × 0.3 + 3 × 1 = 41 credits = $41 (invoice credit, not priced again)
		await expectCreatedInvoiceCorrect({
			ctx,
			response,
			lines: [{ amount: 41, quantity: 41 }],
			total: 41,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("invoices.create: two plans keep their lines under their own plan id")}`,
	async () => {
		const customerId = "inv-create-multi-plan";
		const pro = products.pro({
			id: "pro-create-multi",
			items: [items.prepaidUsers()],
		});
		const annual = products.proAnnual({
			id: "pro-create-multi-annual",
			items: [],
		});
		const { ctx, autumnV2_3 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, annual] }),
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
								quantity: 1,
							},
						],
					},
					{ plan_id: annual.id },
				],
			},
		});

		const { invoice } = await expectCreatedInvoiceCorrect({
			ctx,
			response,
			lines: [
				{ amount: PRO_BASE },
				{ amount: 10, quantity: 1 },
				{ amount: 200 },
			],
			total: 230,
		});
		expect(response.preview.lines.map((line) => line.plan_id)).toEqual([
			pro.id,
			pro.id,
			annual.id,
		]);
		expect(invoice.plan_ids.sort()).toEqual([pro.id, annual.id].sort());
	},
);

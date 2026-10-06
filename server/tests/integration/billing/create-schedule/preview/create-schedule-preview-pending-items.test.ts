import { expect, test } from "bun:test";
import type {
	ApiCustomerV3,
	CreateScheduleParamsV0Input,
} from "@autumn/shared";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { previewCreateSchedule } from "./utils/createSchedulePreviewUtils";

test.concurrent(
	`${chalk.yellowBright("create-schedule preview 15: invoice includes existing pending Stripe invoice items")}`,
	async () => {
		const pro = products.pro({
			id: "preview-pending-items-pro",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const premium = products.premium({
			id: "preview-pending-items-premium",
			items: [items.monthlyMessages({ includedUsage: 500 })],
		});

		const { customerId, autumnV1, ctx, advancedTo } = await initScenario({
			customerId: "create-schedule-preview-pending-items",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, premium] }),
			],
			actions: [s.billing.attach({ productId: pro.id })],
		});

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		const stripeSubscriptions = await ctx.stripeCli.subscriptions.list({
			customer: customer.stripe_id!,
			limit: 1,
		});
		const stripeSubscription = stripeSubscriptions.data[0];
		expect(stripeSubscription).toBeDefined();

		await ctx.stripeCli.invoiceItems.create({
			customer: customer.stripe_id!,
			subscription: stripeSubscription.id,
			amount: 12345,
			currency: "usd",
			description: "Unrelated pending Stripe invoice item",
		});

		const params: CreateScheduleParamsV0Input = {
			customer_id: customerId,
			invoice_mode: {
				enabled: true,
				finalize: false,
				enable_plan_immediately: true,
			},
			phases: [
				{
					starts_at: advancedTo,
					plans: [{ plan_id: premium.id }],
				},
			],
		};
		const preview = await previewCreateSchedule({ autumnV1, params });
		const response = await autumnV1.billing.createSchedule(params);

		expect(response.status).toBe("created");
		expect(preview.total).toBe(30);
		expect(response.invoice?.total).toBe(153.45);

		const stripeInvoice = await ctx.stripeCli.invoices.retrieve(
			response.invoice!.stripe_id!,
			{ expand: ["lines"] },
		);
		expect(stripeInvoice.total).toBe(15345);
		expect(
			stripeInvoice.lines.data.some(
				(line) => line.description === "Unrelated pending Stripe invoice item",
			),
		).toBe(true);
	},
);

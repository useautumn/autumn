/**
 * Red (before):  updating a send_invoice subscription without invoice_mode charged the card now; with no card the
 *                plan was left pending behind a payment URL (required_action) and expired after 10 minutes.
 * Green (after): the change is invoiced on the subscription's terms like its renewals, and applies immediately.
 */

import { expect, test } from "bun:test";
import {
	type ApiCustomerV3,
	BillingInterval,
	CusProductStatus,
} from "@autumn/shared";
import { expectInvoiceSentOnTerms } from "@tests/integration/billing/utils/expectInvoiceSentOnTerms";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { CusService } from "@/internal/customers/CusService";

const NET_TERMS_DAYS = 14;

const expectUpdateInvoiced = async ({
	customerId,
	withCard,
}: {
	customerId: string;
	withCard: boolean;
}) => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.base({
		id: "pro",
		items: [messagesItem, items.monthlyPrice({ price: 20 })],
	});
	const { autumnV1, autumnV2_4, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer(withCard ? { paymentMethod: "success" } : {}),
			s.products({ list: [pro] }),
		],
		actions: [],
	});
	await autumnV2_4.billing.attach({
		customer_id: customerId,
		plan_id: pro.id,
		invoice_mode: {
			enabled: true,
			enable_plan_immediately: true,
			net_terms_days: NET_TERMS_DAYS,
		},
	});

	const updateParams = {
		customer_id: customerId,
		product_id: pro.id,
		items: [messagesItem, items.monthlyPrice({ price: 30 })],
	};
	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);
	const result = await autumnV1.subscriptions.update(updateParams);

	expect(result.required_action).toBeUndefined();
	expect(result.payment_url).toBe(result.invoice?.hosted_invoice_url);
	const stripeInvoice = await ctx.stripeCli.invoices.retrieve(
		result.invoice!.stripe_id,
	);
	expectInvoiceSentOnTerms({ stripeInvoice, netTermsDays: NET_TERMS_DAYS });
	expect(stripeInvoice.total / 100).toBeCloseTo(preview.total, 2);

	const fullCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
	});
	const proRows = fullCustomer.customer_products.filter(
		(customerProduct) =>
			customerProduct.product.id === pro.id &&
			customerProduct.status !== CusProductStatus.Expired,
	);
	expect(proRows.map(({ status }) => status)).toEqual([
		CusProductStatus.Active,
	]);
	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expect(customer.products.find(({ id }) => id === pro.id)?.status).toBe(
		"active",
	);
};

test.concurrent(
	`${chalk.yellowBright("update inherits send_invoice: no card on file, the change is invoiced and applies now")}`,
	async () => {
		await expectUpdateInvoiced({
			customerId: "update-inherit-send-invoice-no-card",
			withCard: false,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("update inherits send_invoice: a card on file isn't charged, the change is invoiced like renewals")}`,
	async () => {
		await expectUpdateInvoiced({
			customerId: "update-inherit-send-invoice-card",
			withCard: true,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("update inherits send_invoice: an allowance-only edit needs no invoice and still applies")}`,
	async () => {
		const customerId = "update-inherit-send-invoice-allowance";
		const priceItem = items.monthlyPrice({ price: 20 });
		const pro = products.base({
			id: "pro",
			items: [items.monthlyMessages({ includedUsage: 100 }), priceItem],
		});
		const { autumnV1, autumnV2_4 } = await initScenario({
			customerId,
			setup: [s.customer({}), s.products({ list: [pro] })],
			actions: [],
		});
		await autumnV2_4.billing.attach({
			customer_id: customerId,
			plan_id: pro.id,
			invoice_mode: { enabled: true, enable_plan_immediately: true },
		});

		const result = await autumnV1.subscriptions.update({
			customer_id: customerId,
			product_id: pro.id,
			items: [items.monthlyMessages({ includedUsage: 200 }), priceItem],
		});

		expect(result.required_action).toBeUndefined();
		expect(result.payment_url ?? null).toBeNull();
		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		expect(customer.features.messages?.included_usage).toBe(200);
	},
);

test.concurrent(
	`${chalk.yellowBright("update inherits send_invoice: an explicit invoice_mode enabled false still charges the card")}`,
	async () => {
		const customerId = "update-inherit-send-invoice-explicit-charge";
		const pro = products.base({
			id: "pro",
			items: [
				items.monthlyMessages({ includedUsage: 100 }),
				items.monthlyPrice({ price: 20 }),
			],
		});
		const { autumnV2_4, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [],
		});
		await autumnV2_4.billing.attach({
			customer_id: customerId,
			plan_id: pro.id,
			invoice_mode: { enabled: true, enable_plan_immediately: true },
		});

		const result = await autumnV2_4.subscriptions.update({
			customer_id: customerId,
			plan_id: pro.id,
			customize: { price: { amount: 30, interval: BillingInterval.Month } },
			invoice_mode: { enabled: false },
		});

		const stripeInvoice = await ctx.stripeCli.invoices.retrieve(
			result.invoice!.stripe_id,
		);
		expect(stripeInvoice.collection_method).toBe("charge_automatically");
		expect(stripeInvoice.status).toBe("paid");
	},
);

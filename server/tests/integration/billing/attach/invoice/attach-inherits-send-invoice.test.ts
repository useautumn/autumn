/**
 * Red (before):  an attach that upgrades a send_invoice subscription without invoice_mode charged the card now.
 * Green (after): the upgrade is invoiced on the subscription's net terms, and the new plan is active now.
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV3, InvoicePaymentMethod } from "@autumn/shared";
import { expectInvoiceSentOnTerms } from "@tests/integration/billing/utils/expectInvoiceSentOnTerms";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

const NET_TERMS_DAYS = 14;
const PAYMENT_METHOD_TYPES: InvoicePaymentMethod[] = [
	"card",
	"us_bank_account",
];

test.concurrent(
	`${chalk.yellowBright("attach inherits send_invoice: an upgrade on an invoiced subscription is invoiced, not charged")}`,
	async () => {
		const customerId = "attach-inherit-send-invoice";
		const pro = products.pro({ items: [items.monthlyMessages()] });
		const premium = products.premium({ items: [items.monthlyMessages()] });
		const { autumnV1, autumnV2_4, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, premium] }),
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
				payment_method_types: PAYMENT_METHOD_TYPES,
			},
		});

		const result = await autumnV2_4.billing.attach({
			customer_id: customerId,
			plan_id: premium.id,
		});

		expect(result.required_action).toBeUndefined();
		expectInvoiceSentOnTerms({
			stripeInvoice: await ctx.stripeCli.invoices.retrieve(
				result.invoice!.stripe_id,
			),
			netTermsDays: NET_TERMS_DAYS,
			paymentMethodTypes: PAYMENT_METHOD_TYPES,
		});
		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		expect(customer.products.find(({ id }) => id === premium.id)?.status).toBe(
			"active",
		);
	},
);

/**
 * An invoice-mode auto top-up invoice uses the org's invoice settings:
 * `allowed_payment_methods` as its payment method types and
 * `default_invoice_net_terms_days` as its net terms.
 */

import { expect, test } from "bun:test";
import { ms, msToSeconds } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { timeout } from "@tests/utils/genUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { makeAutoTopupConfig } from "./utils/makeAutoTopupConfig.js";

const AUTO_TOPUP_WAIT_MS = 20000;
const NET_TERMS_DAYS = 14;

test.concurrent(
	`${chalk.yellowBright("auto-topup invoice-mode: invoice gets the org's payment method types and net terms")}`,
	async () => {
		const oneOffProd = products.oneOffAddOn({
			id: "topup-im-pm",
			items: [
				items.oneOffMessages({
					includedUsage: 0,
					billingUnits: 100,
					price: 10,
				}),
			],
		});

		const { customerId, autumnV2_1, ctx, customer } = await initScenario({
			customerId: "auto-topup-im-pm",
			setup: [
				s.platform.create({
					slug: `topup-pm-${Math.random().toString(36).slice(2, 8)}`,
					configOverrides: {
						allowed_payment_methods: ["card"],
						default_invoice_net_terms_days: NET_TERMS_DAYS,
					},
					setupDefaultFeatures: true,
				}),
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [oneOffProd] }),
			],
			actions: [
				s.attach({
					productId: oneOffProd.id,
					options: [{ feature_id: TestFeature.Messages, quantity: 100 }],
				}),
			],
		});

		await autumnV2_1.track(
			{
				customer_id: customerId,
				feature_id: TestFeature.Messages,
				value: 85,
			},
			{ timeout: 3000 },
		);

		// Enabling the config while already below threshold dispatches the top-up.
		await autumnV2_1.customers.update(customerId, {
			billing_controls: makeAutoTopupConfig({
				threshold: 20,
				quantity: 100,
				invoiceMode: true,
			}),
		});

		await timeout(AUTO_TOPUP_WAIT_MS);

		const { data: invoices } = await ctx.stripeCli.invoices.list({
			customer: customer!.processor!.id!,
			limit: 10,
		});
		const topUpInvoice = invoices.find(
			(invoice) => invoice.collection_method === "send_invoice",
		);

		expect(topUpInvoice).toBeDefined();
		expect(topUpInvoice!.payment_settings.payment_method_types).toEqual([
			"card",
		]);
		expect(topUpInvoice!.due_date! - topUpInvoice!.created).toBe(
			msToSeconds(ms.days(NET_TERMS_DAYS)),
		);
	},
);

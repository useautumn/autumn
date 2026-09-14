/**
 * invoices.pay: mark a Stripe invoice paid out of band (no charge attempted).
 *
 * Contract:
 *   POST /invoices.pay { invoice_id } -> { invoice: ApiListInvoiceV1 }
 *   open invoice   → Stripe status paid, amount_paid = total, our row updated inline
 *   already paid   → 200, unchanged
 *   draft invoice  → 400 (Stripe cannot pay an unfinalized invoice)
 *   non-Stripe     → 400
 *
 * Red (current):  route missing (404).
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV3, ApiListInvoiceV1 } from "@autumn/shared";
import { ErrCode, ProcessorType } from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

type PayResponse = { invoice: ApiListInvoiceV1 };

const attachInvoiceMode = async ({
	autumnV1,
	customerId,
	productId,
	finalize,
}: {
	autumnV1: Awaited<ReturnType<typeof initScenario>>["autumnV1"];
	customerId: string;
	productId: string;
	finalize: boolean;
}) =>
	autumnV1.billing.attach({
		customer_id: customerId,
		product_id: productId,
		invoice: true,
		finalize_invoice: finalize,
		enable_product_immediately: true,
		redirect_mode: "if_required",
	});

test.concurrent(
	`${chalk.yellowBright("invoices.pay: open invoice → paid out of band, row updated inline")}`,
	async () => {
		const customerId = "inv-pay-open";
		const pro = products.pro({
			id: "pro-pay",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const { autumnV1, autumnV2_3 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [],
		});

		const attached = await attachInvoiceMode({
			autumnV1,
			customerId,
			productId: pro.id,
			finalize: true,
		});
		expect(attached.invoice!.status).toBe("open");

		const { list } = (await autumnV2_3.post("/invoices.list", {
			customer_id: customerId,
		})) as {
			list: ApiListInvoiceV1[];
		};
		const invoiceId = list[0].id;

		const { invoice } = (await autumnV2_3.post("/invoices.pay", {
			invoice_id: invoiceId,
		})) as PayResponse;
		expect(invoice.id).toBe(invoiceId);
		expect(invoice.status).toBe("paid");
		expect(invoice.amount_paid).toBe(invoice.total);

		const stripeInvoice = await ctx.stripeCli.invoices.retrieve(
			invoice.stripe_id,
		);
		expect(stripeInvoice.status).toBe("paid");
		// No charge was made: paid with no payments recorded
		expect(stripeInvoice.amount_paid).toBe(stripeInvoice.total);
		expect(stripeInvoice.payments?.data ?? []).toEqual([]);

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectCustomerInvoiceCorrect({
			customer,
			count: 1,
			latestStatus: "paid",
		});

		// Idempotent: paying again returns the same paid invoice
		const again = (await autumnV2_3.post("/invoices.pay", {
			invoice_id: invoiceId,
		})) as PayResponse;
		expect(again.invoice.status).toBe("paid");
	},
);

test.concurrent(
	`${chalk.yellowBright("invoices.pay: draft invoice → 400")}`,
	async () => {
		const customerId = "inv-pay-draft";
		const pro = products.pro({
			id: "pro-pay-draft",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const { autumnV1, autumnV2_3 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [],
		});

		const attached = await attachInvoiceMode({
			autumnV1,
			customerId,
			productId: pro.id,
			finalize: false,
		});
		expect(attached.invoice!.status).toBe("draft");

		const { list } = (await autumnV2_3.post("/invoices.list", {
			customer_id: customerId,
		})) as {
			list: ApiListInvoiceV1[];
		};

		await expectAutumnError({
			errCode: ErrCode.InvalidRequest,
			func: () => autumnV2_3.post("/invoices.pay", { invoice_id: list[0].id }),
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("invoices.pay: non-Stripe invoice → 400")}`,
	async () => {
		const customerId = "inv-pay-non-stripe";
		const { autumnV2_3 } = await initScenario({
			customerId,
			setup: [s.customer({ paymentMethod: "success" })],
			actions: [],
		});

		const inserted = (await autumnV2_3.post("/invoices.insert", {
			invoices: [
				{
					customer_id: customerId,
					plan_ids: [],
					stripe_id: "rc_legacy_123",
					processor_type: ProcessorType.RevenueCat,
					status: "open",
					total: 10,
					amount_paid: 0,
					refunded_amount: 0,
					currency: "usd",
					created_at: Date.now(),
					hosted_invoice_url: null,
				},
			],
		})) as { invoices: { id: string }[] };

		await expectAutumnError({
			errCode: ErrCode.InvalidRequest,
			func: () =>
				autumnV2_3.post("/invoices.pay", {
					invoice_id: inserted.invoices[0].id,
				}),
		});
	},
);

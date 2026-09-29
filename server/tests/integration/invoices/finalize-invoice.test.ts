/**
 * invoices.finalize: finalize a draft Stripe invoice by its Autumn invoice ID.
 *
 * Contract:
 *   POST /invoices.finalize { invoice_id } -> { invoice: ApiListInvoiceV1 }
 *   draft invoice          → Stripe status open, auto_advance on, our row updated inline
 *   deferred (pending)     → pending plan now expires at the invoice's due date
 *   already open or paid   → 200, unchanged
 *   void invoice           → 400
 *   non-Stripe             → 400
 */

import { expect, test } from "bun:test";
import type { ApiListInvoiceV1 } from "@autumn/shared";
import {
	ALL_STATUSES,
	CusProductStatus,
	ErrCode,
	ProcessorType,
} from "@autumn/shared";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService";
import { MetadataService } from "@/internal/metadata/MetadataService";

type FinalizeResponse = { invoice: ApiListInvoiceV1 };

const listInvoiceIds = async ({
	autumnV2_3,
	customerId,
}: {
	autumnV2_3: Awaited<ReturnType<typeof initScenario>>["autumnV2_3"];
	customerId: string;
}) => {
	const { list } = (await autumnV2_3.post("/invoices.list", {
		customer_id: customerId,
	})) as { list: ApiListInvoiceV1[] };
	return list.map((invoice) => invoice.id);
};

test.concurrent(
	`${chalk.yellowBright("invoices.finalize: deferred draft → open, pending plan expires at due date, idempotent")}`,
	async () => {
		const customerId = "inv-finalize-draft";
		const pro = products.pro({
			id: "pro-finalize",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const { autumnV2_3, customer } = await initScenario({
			customerId,
			setup: [s.customer({ testClock: false }), s.products({ list: [pro] })],
			actions: [
				s.billing.attach({
					productId: pro.id,
					invoice: true,
					enableProductImmediately: false,
					finalizeInvoice: false,
				}),
			],
		});

		const [invoiceId] = await listInvoiceIds({ autumnV2_3, customerId });

		const { invoice } = (await autumnV2_3.post("/invoices.finalize", {
			invoice_id: invoiceId,
		})) as FinalizeResponse;
		expect(invoice.id).toBe(invoiceId);
		expect(invoice.status).toBe("open");

		const stripeInvoice = await ctx.stripeCli.invoices.retrieve(
			invoice.stripe_id,
		);
		expect(stripeInvoice.status).toBe("open");
		expect(stripeInvoice.auto_advance).toBe(true);
		expect(stripeInvoice.due_date).toBeTruthy();

		const pending = (
			await CusProductService.list({
				db: ctx.db,
				internalCustomerId: customer?.internal_id ?? "",
				inStatuses: ALL_STATUSES,
			})
		).find((customerProduct) => customerProduct.product.id === pro.id);
		expect(pending?.status).toBe(CusProductStatus.Pending);

		const metadata = await MetadataService.get({
			db: ctx.db,
			id: pending?.metadata_id ?? "",
		});
		expect(metadata?.expires_at).toBe((stripeInvoice.due_date ?? 0) * 1000);

		const again = (await autumnV2_3.post("/invoices.finalize", {
			invoice_id: invoiceId,
		})) as FinalizeResponse;
		expect(again.invoice.status).toBe("open");
	},
);

test.concurrent(
	`${chalk.yellowBright("invoices.finalize: paid invoice → 200 unchanged")}`,
	async () => {
		const customerId = "inv-finalize-paid";
		const pro = products.pro({
			id: "pro-finalize-paid",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const { autumnV2_3 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [s.billing.attach({ productId: pro.id })],
		});

		const [invoiceId] = await listInvoiceIds({ autumnV2_3, customerId });
		const { invoice } = (await autumnV2_3.post("/invoices.finalize", {
			invoice_id: invoiceId,
		})) as FinalizeResponse;
		expect(invoice.id).toBe(invoiceId);
		expect(invoice.status).toBe("paid");
	},
);

test.concurrent(
	`${chalk.yellowBright("invoices.finalize: void invoice → 400")}`,
	async () => {
		const customerId = "inv-finalize-void";
		const pro = products.pro({
			id: "pro-finalize-void",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const { autumnV2_3 } = await initScenario({
			customerId,
			setup: [s.customer({ testClock: false }), s.products({ list: [pro] })],
			actions: [
				s.billing.attach({
					productId: pro.id,
					invoice: true,
					enableProductImmediately: true,
					finalizeInvoice: true,
				}),
			],
		});

		const [invoiceId] = await listInvoiceIds({ autumnV2_3, customerId });
		await autumnV2_3.post("/invoices.void", { invoice_id: invoiceId });

		await expectAutumnError({
			errCode: ErrCode.InvalidRequest,
			func: () =>
				autumnV2_3.post("/invoices.finalize", { invoice_id: invoiceId }),
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("invoices.finalize: non-Stripe invoice → 400")}`,
	async () => {
		const customerId = "inv-finalize-non-stripe";
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
					stripe_id: "rc_finalize_123",
					processor_type: ProcessorType.RevenueCat,
					status: "draft",
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
				autumnV2_3.post("/invoices.finalize", {
					invoice_id: inserted.invoices[0].id,
				}),
		});
	},
);

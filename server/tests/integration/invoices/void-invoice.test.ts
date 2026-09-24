/**
 * invoices.void: void a finalized, unpaid Stripe invoice.
 *
 * Contract:
 *   POST /invoices.void { invoice_id } -> { invoice: ApiListInvoiceV1 }
 *   open invoice          → Stripe status void, our row updated inline
 *   deferred (pending)    → pending plan expires, new sub canceled, metadata deleted
 *   already void          → 200, unchanged
 *   paid invoice          → 400
 *   non-Stripe            → 400
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
import { stripeInvoiceToStripeSubscriptionId } from "@/external/stripe/invoices/utils/convertStripeInvoice";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService";
import { MetadataService } from "@/internal/metadata/MetadataService";

type VoidResponse = { invoice: ApiListInvoiceV1 };

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
	`${chalk.yellowBright("invoices.void: open invoice → void, row updated inline, idempotent")}`,
	async () => {
		const customerId = "inv-void-open";
		const pro = products.pro({
			id: "pro-void",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const { autumnV2_3 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
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

		const { invoice } = (await autumnV2_3.post("/invoices.void", {
			invoice_id: invoiceId,
		})) as VoidResponse;
		expect(invoice.id).toBe(invoiceId);
		expect(invoice.status).toBe("void");

		const stripeInvoice = await ctx.stripeCli.invoices.retrieve(
			invoice.stripe_id,
		);
		expect(stripeInvoice.status).toBe("void");

		const again = (await autumnV2_3.post("/invoices.void", {
			invoice_id: invoiceId,
		})) as VoidResponse;
		expect(again.invoice.status).toBe("void");
	},
);

test.concurrent(
	`${chalk.yellowBright("invoices.void: deferred invoice → pending plan expires and metadata is deleted")}`,
	async () => {
		const customerId = `inv-void-pending-${Date.now()}`;
		const pro = products.pro({
			id: "pro-void-pending",
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
					finalizeInvoice: true,
				}),
			],
		});

		const pendingBefore = (
			await CusProductService.list({
				db: ctx.db,
				internalCustomerId: customer?.internal_id ?? "",
				inStatuses: ALL_STATUSES,
			})
		).find((customerProduct) => customerProduct.product.id === pro.id);
		expect(pendingBefore?.status).toBe(CusProductStatus.Pending);
		const metadataId = pendingBefore?.metadata_id ?? "";
		expect(metadataId).toBeTruthy();

		const [invoiceId] = await listInvoiceIds({ autumnV2_3, customerId });
		const { invoice } = (await autumnV2_3.post("/invoices.void", {
			invoice_id: invoiceId,
		})) as VoidResponse;
		expect(invoice.status).toBe("void");

		const expired = (
			await CusProductService.list({
				db: ctx.db,
				internalCustomerId: customer?.internal_id ?? "",
				inStatuses: ALL_STATUSES,
			})
		).find((customerProduct) => customerProduct.product.id === pro.id);
		expect(expired?.status).toBe(CusProductStatus.Expired);
		expect(expired?.metadata_id).toBeNull();

		const metadata = await MetadataService.get({ db: ctx.db, id: metadataId });
		expect(metadata).toBeNull();

		const stripeInvoice = await ctx.stripeCli.invoices.retrieve(
			invoice.stripe_id,
		);
		const stripeSubscription = await ctx.stripeCli.subscriptions.retrieve(
			stripeInvoiceToStripeSubscriptionId(stripeInvoice)!,
		);
		expect(stripeSubscription.status).toBe("canceled");
	},
);

test.concurrent(
	`${chalk.yellowBright("invoices.void: paid invoice → 400")}`,
	async () => {
		const customerId = "inv-void-paid";
		const pro = products.pro({
			id: "pro-void-paid",
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

		await expectAutumnError({
			errCode: ErrCode.InvalidRequest,
			func: () => autumnV2_3.post("/invoices.void", { invoice_id: invoiceId }),
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("invoices.void: non-Stripe invoice → 400")}`,
	async () => {
		const customerId = "inv-void-non-stripe";
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
					stripe_id: "rc_void_123",
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
				autumnV2_3.post("/invoices.void", {
					invoice_id: inserted.invoices[0].id,
				}),
		});
	},
);

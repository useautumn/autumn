/**
 * invoices.reissue: void an open send-invoice invoice and issue a replacement.
 *
 * Contract:
 *   POST /invoices.reissue { invoice_id, invoice_template_id?, net_terms_days? }
 *     -> { invoice: ApiListInvoiceV1, voided_invoice_id }
 *   open invoice     → original void, replacement open with same total, template footer applied,
 *                      linked to the same subscription and inheriting deferred metadata
 *   deferred invoice → paying the replacement promotes the pending plan
 *   void invoice     → 400
 *   charge-automatically invoice → 400 (reissue is send-invoice only)
 */

import { expect, test } from "bun:test";
import type {
	ApiCustomerV5,
	ApiListInvoiceV1,
	AttachParamsV1Input,
} from "@autumn/shared";
import { ALL_STATUSES, CusProductStatus, ErrCode } from "@autumn/shared";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService";
import { invoiceLineItemRepo } from "@/internal/invoices/lineItems/repos";
import { MetadataService } from "@/internal/metadata/MetadataService";
import { InvoiceTemplateService } from "@/internal/orgs/invoiceTemplates/InvoiceTemplateService";
import { generateId } from "@/utils/genUtils";

type ReissueResponse = { invoice: ApiListInvoiceV1; voided_invoice_id: string };

const FOOTER = "Pay by bank transfer: IBAN TEST0000";
const NEW_EMAIL = "accounts-payable@example.com";

const createTemplate = async () => {
	const id = generateId("inv_tmpl");
	await InvoiceTemplateService.create({
		db: ctx.db,
		orgId: ctx.org.id,
		internalId: generateId("inv_tmpl_int"),
		id,
		values: { name: "Bank transfer", footer: FOOTER, memo: "Reissued" },
	});
	return id;
};

const attachDeferred = ({
	autumnV2_4,
	customerId,
	planId,
	enablePlanImmediately,
}: {
	autumnV2_4: Awaited<ReturnType<typeof initScenario>>["autumnV2_4"];
	customerId: string;
	planId: string;
	enablePlanImmediately: boolean;
}) =>
	autumnV2_4.billing.attach<AttachParamsV1Input>({
		customer_id: customerId,
		plan_id: planId,
		invoice_mode: {
			enabled: true,
			finalize: true,
			enable_plan_immediately: enablePlanImmediately,
			net_terms_days: 7,
		},
	});

const firstInvoiceId = async ({
	autumnV2_3,
	customerId,
}: {
	autumnV2_3: Awaited<ReturnType<typeof initScenario>>["autumnV2_3"];
	customerId: string;
}) => {
	const { list } = (await autumnV2_3.post("/invoices.list", {
		customer_id: customerId,
	})) as { list: ApiListInvoiceV1[] };
	return list[0].id;
};

test.concurrent(
	`${chalk.yellowBright("invoices.reissue: open invoice → original void, replacement linked with template footer")}`,
	async () => {
		const customerId = "inv-reissue-open";
		const pro = products.pro({
			id: "pro-reissue",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const { autumnV2_3, autumnV2_4 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [],
		});

		await attachDeferred({
			autumnV2_4,
			customerId,
			planId: pro.id,
			enablePlanImmediately: true,
		});
		const originalId = await firstInvoiceId({ autumnV2_3, customerId });
		const templateId = await createTemplate();

		const { invoice, voided_invoice_id } = (await autumnV2_3.post(
			"/invoices.reissue",
			{
				invoice_id: originalId,
				invoice_template_id: templateId,
				update_customer_email: NEW_EMAIL,
			},
		)) as ReissueResponse;

		expect(voided_invoice_id).toBe(originalId);
		expect(invoice.id).not.toBe(originalId);
		expect(invoice.status).toBe("open");

		const original = await ctx.stripeCli.invoices.retrieve(
			(
				(await autumnV2_3.post("/invoices.list", {
					customer_id: customerId,
				})) as { list: ApiListInvoiceV1[] }
			).list.find((row) => row.id === originalId)!.stripe_id,
		);
		const replacement = await ctx.stripeCli.invoices.retrieve(
			invoice.stripe_id,
		);

		expect(original.status).toBe("void");
		expect(original.metadata?.autumn_reissued_to).toBe(replacement.id);
		expect(replacement.status).toBe("open");
		expect(replacement.total).toBe(original.total);
		expect(replacement.footer).toBe(FOOTER);
		expect(replacement.auto_advance).toBe(true);
		expect(replacement.due_date).toBe(original.due_date);
		expect(replacement.customer_email).toBe(NEW_EMAIL);

		// Autumn holds the new address too, or the next Stripe sync would undo it.
		const updatedCustomer =
			await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
		expect(updatedCustomer.email).toBe(NEW_EMAIL);
		expect(replacement.parent?.subscription_details?.subscription).toBe(
			original.parent?.subscription_details?.subscription,
		);

		const [originalRows, replacementRows] = await Promise.all([
			invoiceLineItemRepo.getByInvoiceIds({
				db: ctx.db,
				invoiceIds: [originalId],
			}),
			invoiceLineItemRepo.getByInvoiceIds({
				db: ctx.db,
				invoiceIds: [invoice.id],
			}),
		]);
		expect(replacementRows.length).toBe(originalRows.length);
		expect(replacementRows.length).toBeGreaterThan(0);
		for (const row of replacementRows) {
			expect(row.customer_product_ids.length).toBeGreaterThan(0);
			expect(row.stripe_invoice_id).toBe(replacement.id);
		}

		await expectAutumnError({
			errCode: ErrCode.InvalidRequest,
			func: () =>
				autumnV2_3.post("/invoices.reissue", { invoice_id: originalId }),
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("invoices.reissue: deferred invoice → replacement inherits pending plan, paying it promotes")}`,
	async () => {
		const customerId = `inv-reissue-pending-${Date.now()}`;
		const pro = products.pro({
			id: "pro-reissue-pending",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const { autumnV2_3, autumnV2_4, customer } = await initScenario({
			customerId,
			setup: [s.customer({ testClock: false }), s.products({ list: [pro] })],
			actions: [],
		});

		await attachDeferred({
			autumnV2_4,
			customerId,
			planId: pro.id,
			enablePlanImmediately: false,
		});

		const listPending = async () =>
			(
				await CusProductService.list({
					db: ctx.db,
					internalCustomerId: customer?.internal_id ?? "",
					inStatuses: ALL_STATUSES,
				})
			).find((customerProduct) => customerProduct.product.id === pro.id);

		const pending = await listPending();
		expect(pending?.status).toBe(CusProductStatus.Pending);
		const metadataId = pending?.metadata_id ?? "";

		const originalId = await firstInvoiceId({ autumnV2_3, customerId });
		const { invoice } = (await autumnV2_3.post("/invoices.reissue", {
			invoice_id: originalId,
		})) as ReissueResponse;

		const metadata = await MetadataService.get({ db: ctx.db, id: metadataId });
		expect(metadata?.stripe_invoice_id).toBe(invoice.stripe_id);
		expect((await listPending())?.status).toBe(CusProductStatus.Pending);

		const replacement = await ctx.stripeCli.invoices.retrieve(
			invoice.stripe_id,
		);
		expect(replacement.metadata?.autumn_metadata_id).toBe(metadataId);

		await autumnV2_3.post("/invoices.pay", { invoice_id: invoice.id });
		await new Promise((resolve) => setTimeout(resolve, 12_000));

		const promoted = await listPending();
		expect(promoted?.status).toBe(CusProductStatus.Active);
		expect(promoted?.metadata_id).toBeNull();
	},
);

test.concurrent(
	`${chalk.yellowBright("invoices.reissue: charge-automatically invoice → 400")}`,
	async () => {
		const customerId = "inv-reissue-paid";
		const pro = products.pro({
			id: "pro-reissue-paid",
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

		const invoiceId = await firstInvoiceId({ autumnV2_3, customerId });
		await expectAutumnError({
			errCode: ErrCode.InvalidRequest,
			errMessage: "charged automatically",
			func: () =>
				autumnV2_3.post("/invoices.reissue", { invoice_id: invoiceId }),
		});
	},
);

/**
 * invoices.reissue adjustments: correcting an invoice while replacing it.
 *
 * Contract:
 *   invoice.tax_rate_id: null   -> replacement carries no tax
 *   invoice.custom_fields       -> PO number shown on the replacement only
 *   lines.update / add          -> the replacement bills different amounts
 *   customer.name / address / tax_ids -> persisted on the customer and snapshotted
 *   any adjustment              -> the totals-must-match guard no longer applies
 */

import { expect, test } from "bun:test";
import type {
	ApiCustomerV5,
	ApiListInvoiceV1,
	AttachParamsV1Input,
	CreateInvoicePreview,
} from "@autumn/shared";
import { ErrCode } from "@autumn/shared";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { CusService } from "@/internal/customers/CusService";
import { invoiceLineItemRepo } from "@/internal/invoices/lineItems/repos";
import { InvoiceTemplateService } from "@/internal/orgs/invoiceTemplates/InvoiceTemplateService";
import { generateId } from "@/utils/genUtils";

type Scenario = Awaited<ReturnType<typeof initScenario>>;
type ReissueResponse = {
	invoice: ApiListInvoiceV1;
	voided_invoice_id: string;
	preview: CreateInvoicePreview;
};

const attachInvoiceMode = ({
	autumnV2_4,
	customerId,
	planId,
	taxRateId,
}: {
	autumnV2_4: Scenario["autumnV2_4"];
	customerId: string;
	planId: string;
	taxRateId?: string;
}) =>
	autumnV2_4.billing.attach<AttachParamsV1Input>({
		customer_id: customerId,
		plan_id: planId,
		...(taxRateId ? { tax_rate_id: taxRateId } : {}),
		invoice_mode: {
			enabled: true,
			finalize: true,
			enable_plan_immediately: true,
		},
	});

const firstInvoice = async ({
	autumnV2_3,
	customerId,
}: {
	autumnV2_3: Scenario["autumnV2_3"];
	customerId: string;
}) => {
	const { list } = (await autumnV2_3.post("/invoices.list", {
		customer_id: customerId,
	})) as { list: ApiListInvoiceV1[] };
	return list[0];
};

test.concurrent(
	`${chalk.yellowBright("invoices.reissue adjustments: dropping the tax rate reissues untaxed with a PO number")}`,
	async () => {
		const customerId = "inv-reissue-adj-tax";
		const pro = products.base({
			id: "pro-reissue-adj-tax",
			items: [items.monthlyPrice({ price: 20 })],
		});
		const { autumnV2_3, autumnV2_4 } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false, paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [],
		});

		const taxRate = await ctx.stripeCli.taxRates.create({
			display_name: "US Tax",
			percentage: 10,
			inclusive: false,
		});
		await attachInvoiceMode({
			autumnV2_4,
			customerId,
			planId: pro.id,
			taxRateId: taxRate.id,
		});

		const original = await firstInvoice({ autumnV2_3, customerId });
		expect(original.total).toBe(22);

		const { invoice } = (await autumnV2_3.post("/invoices.reissue", {
			invoice_id: original.id,
			invoice: {
				tax_rate_id: null,
				custom_fields: [{ name: "PO number", value: "PO-4417" }],
			},
		})) as ReissueResponse;

		// $2 of tax is gone, so the guard demanding an identical total must have stood down.
		expect(invoice.total).toBe(20);

		const replacement = await ctx.stripeCli.invoices.retrieve(
			invoice.stripe_id,
		);
		expect(replacement.total).toBe(2000);
		expect(replacement.default_tax_rates).toEqual([]);
		expect(replacement.custom_fields).toEqual([
			{ name: "PO number", value: "PO-4417" },
		]);

		// The original now points at its replacement and cannot be reissued twice.
		await expectAutumnError({
			errCode: ErrCode.InvalidRequest,
			errMessage: "already reissued",
			func: () =>
				autumnV2_3.post("/invoices.reissue", { invoice_id: original.id }),
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("invoices.reissue adjustments: a null footer clears the template's instead of inheriting it")}`,
	async () => {
		const customerId = "inv-reissue-adj-footer";
		const pro = products.base({
			id: "pro-reissue-adj-footer",
			items: [items.monthlyPrice({ price: 20 })],
		});
		const { autumnV2_3, autumnV2_4 } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false, paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [],
		});

		const templateId = generateId("inv_tmpl");
		await InvoiceTemplateService.create({
			db: ctx.db,
			orgId: ctx.org.id,
			internalId: generateId("inv_tmpl_int"),
			id: templateId,
			values: {
				name: "Bank transfer",
				footer: "IBAN TEST0000",
				memo: "Pay up",
			},
		});

		await attachInvoiceMode({ autumnV2_4, customerId, planId: pro.id });
		const original = await firstInvoice({ autumnV2_3, customerId });

		const { invoice: withFooter } = (await autumnV2_3.post(
			"/invoices.reissue",
			{ invoice_id: original.id, invoice_template_id: templateId },
		)) as ReissueResponse;
		expect(
			(await ctx.stripeCli.invoices.retrieve(withFooter.stripe_id)).footer,
		).toBe("IBAN TEST0000");

		const { invoice: cleared } = (await autumnV2_3.post("/invoices.reissue", {
			invoice_id: withFooter.id,
			invoice_template_id: templateId,
			invoice: { footer: null, memo: null },
		})) as ReissueResponse;

		const replacement = await ctx.stripeCli.invoices.retrieve(
			cleared.stripe_id,
		);
		expect(replacement.footer).toBeNull();
		expect(replacement.description).toBeNull();
	},
);

test.concurrent(
	`${chalk.yellowBright("invoices.reissue adjustments: line edits change what the replacement bills")}`,
	async () => {
		const customerId = "inv-reissue-adj-lines";
		const pro = products.base({
			id: "pro-reissue-adj-lines",
			items: [items.monthlyPrice({ price: 20 })],
		});
		const { autumnV2_3, autumnV2_4 } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false, paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [],
		});

		await attachInvoiceMode({ autumnV2_4, customerId, planId: pro.id });
		const original = await firstInvoice({ autumnV2_3, customerId });
		const baseLine = original.items?.[0];
		if (!baseLine) throw new Error("original invoice has no line items");

		const { invoice, preview } = (await autumnV2_3.post("/invoices.reissue", {
			invoice_id: original.id,
			lines: {
				update: [{ id: baseLine.id, amount: 15 }],
				add: [{ description: "Onboarding", amount: 100 }],
			},
		})) as ReissueResponse;

		expect(invoice.total).toBe(115);
		// The returned preview describes what was issued, not the original's $20.
		expect(preview.total).toBe(115);
		expect(
			preview.lines.map((line) => line.amount).sort((a, b) => a - b),
		).toEqual([15, 100]);

		const replacement = await ctx.stripeCli.invoices.retrieve(
			invoice.stripe_id,
			{ expand: ["lines"] },
		);
		expect(
			replacement.lines.data.map((line) => line.amount).sort((a, b) => a - b),
		).toEqual([1500, 10000]);

		// The stored Autumn row must follow the edit, not the original's $20.
		const storedRows = await invoiceLineItemRepo.getByInvoiceIds({
			db: ctx.db,
			invoiceIds: [invoice.id],
		});
		expect(storedRows.map((row) => row.amount).sort((a, b) => a - b)).toEqual([
			15, 100,
		]);
	},
);

test.concurrent(
	`${chalk.yellowBright("invoices.reissue adjustments: customer name, address and tax id persist and are snapshotted")}`,
	async () => {
		const customerId = "inv-reissue-adj-customer";
		const pro = products.base({
			id: "pro-reissue-adj-customer",
			items: [items.monthlyPrice({ price: 20 })],
		});
		const { autumnV2_3, autumnV2_4 } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false, paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [],
		});

		await attachInvoiceMode({ autumnV2_4, customerId, planId: pro.id });
		const original = await firstInvoice({ autumnV2_3, customerId });

		await expectAutumnError({
			errCode: ErrCode.InvalidRequest,
			func: () =>
				autumnV2_3.post("/invoices.reissue", {
					invoice_id: original.id,
					update_customer_email: "one@example.com",
					customer: { email: "two@example.com" },
				}),
		});

		const { invoice } = (await autumnV2_3.post("/invoices.reissue", {
			invoice_id: original.id,
			customer: {
				name: "Acme SAS",
				address: {
					line1: "12 Rue de Rivoli",
					line2: "Bâtiment B",
					city: "Paris",
					postal_code: "75004",
					country: "FR",
				},
				tax_ids: [{ type: "eu_vat", value: "FR12345678901" }],
			},
		})) as ReissueResponse;

		const updated = await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
		expect(updated.name).toBe("Acme SAS");

		const persisted = await CusService.get({
			db: ctx.db,
			idOrInternalId: customerId,
			orgId: ctx.org.id,
			env: ctx.env,
		});
		const stripeCustomerId = persisted?.processor?.id ?? "";
		const stripeCustomer =
			await ctx.stripeCli.customers.retrieve(stripeCustomerId);
		if (!stripeCustomer.deleted) {
			expect(stripeCustomer.name).toBe("Acme SAS");
			expect(stripeCustomer.address?.country).toBe("FR");
		}

		const taxIds = await ctx.stripeCli.customers.listTaxIds(stripeCustomerId);
		expect(taxIds.data.map((taxId) => taxId.value)).toEqual(["FR12345678901"]);

		// The replacement snapshots whatever the customer now says.
		const replacement = await ctx.stripeCli.invoices.retrieve(
			invoice.stripe_id,
		);
		expect(replacement.customer_address?.country).toBe("FR");
		expect(replacement.customer_address?.line2).toBe("Bâtiment B");
		expect(replacement.customer_tax_ids?.[0]?.value).toBe("FR12345678901");

		// The dashboard prefills from the live customer, which the endpoint expands.
		const expanded = (await autumnV2_3.get(
			`/invoices/${invoice.stripe_id}/stripe`,
		)) as { customer: { name: string; address: { line2: string } } };
		expect(expanded.customer.name).toBe("Acme SAS");
		expect(expanded.customer.address.line2).toBe("Bâtiment B");

		// A blank field and an empty tax_ids list clear rather than keep.
		await autumnV2_3.post("/invoices.reissue", {
			invoice_id: invoice.id,
			customer: {
				address: {
					line1: "12 Rue de Rivoli",
					line2: "",
					city: "Paris",
					state: "",
					postal_code: "75004",
					country: "FR",
				},
				tax_ids: [],
			},
		});
		const cleared = await ctx.stripeCli.customers.retrieve(stripeCustomerId);
		if (!cleared.deleted) {
			expect(cleared.address?.line1).toBe("12 Rue de Rivoli");
			// Stripe keeps a cleared sub-field as "" rather than dropping it.
			expect(cleared.address?.line2 ?? "").toBe("");
		}
		const clearedTaxIds =
			await ctx.stripeCli.customers.listTaxIds(stripeCustomerId);
		expect(clearedTaxIds.data).toEqual([]);
	},
);

test.concurrent(
	`${chalk.yellowBright("invoices.reissue adjustments: an added catalog plan is priced and attributed like invoices.create")}`,
	async () => {
		const customerId = "inv-reissue-adj-catalog";
		const pro = products.base({
			id: "pro-reissue-adj-catalog",
			items: [items.monthlyPrice({ price: 20 })],
		});
		const addOn = products.base({
			id: "addon-reissue-adj-catalog",
			items: [items.monthlyPrice({ price: 40 })],
		});
		const { autumnV2_3, autumnV2_4 } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false, paymentMethod: "success" }),
				s.products({ list: [pro, addOn] }),
			],
			actions: [],
		});

		const coupon = await ctx.stripeCli.coupons.create({
			percent_off: 50,
			duration: "once",
		});

		await attachInvoiceMode({ autumnV2_4, customerId, planId: pro.id });
		const original = await firstInvoice({ autumnV2_3, customerId });

		const { invoice } = (await autumnV2_3.post("/invoices.reissue", {
			invoice_id: original.id,
			lines: {
				add: [{ plan_id: addOn.id, discounts: [{ reward_id: coupon.id }] }],
			},
		})) as ReissueResponse;

		// $20 base plus the add-on at half of $40.
		expect(invoice.total).toBe(40);

		const storedRows = await invoiceLineItemRepo.getByInvoiceIds({
			db: ctx.db,
			invoiceIds: [invoice.id],
		});
		const addOnRow = storedRows.find((row) => row.product_id === addOn.id);
		expect(addOnRow).toBeDefined();
		expect(addOnRow?.amount).toBe(40);
	},
);

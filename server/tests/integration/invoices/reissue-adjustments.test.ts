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
} from "@autumn/shared";
import { ErrCode } from "@autumn/shared";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { CusService } from "@/internal/customers/CusService";

type Scenario = Awaited<ReturnType<typeof initScenario>>;
type ReissueResponse = { invoice: ApiListInvoiceV1; voided_invoice_id: string };

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

		const { invoice } = (await autumnV2_3.post("/invoices.reissue", {
			invoice_id: original.id,
			lines: {
				update: [{ id: baseLine.id, amount: 15 }],
				add: [{ description: "Onboarding", amount: 100 }],
			},
		})) as ReissueResponse;

		expect(invoice.total).toBe(115);

		const replacement = await ctx.stripeCli.invoices.retrieve(
			invoice.stripe_id,
			{ expand: ["lines"] },
		);
		expect(
			replacement.lines.data.map((line) => line.amount).sort((a, b) => a - b),
		).toEqual([1500, 10000]);
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
		expect(replacement.customer_tax_ids?.[0]?.value).toBe("FR12345678901");
	},
);

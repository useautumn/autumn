import { describe, expect, test } from "bun:test";
import type { AttachParamsV1, InvoicePaymentMethod } from "@autumn/shared";
import { OrgConfigSchema } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { setupInvoiceModeContext } from "@/internal/billing/v2/setup/setupInvoiceModeContext";

const TEMPLATE_ID = "tmpl_1";

/** Stands in for the `select().from().where().limit()` chain
 *  `InvoiceTemplateService.getById` runs. */
const makeDb = ({
	template,
}: {
	template?: { net_terms_days: number | null };
}) => {
	const rows = template
		? [
				{
					internal_id: "it_1",
					id: TEMPLATE_ID,
					name: "Template",
					footer: null,
					memo: null,
					net_terms_days: template.net_terms_days,
					created_at: 0,
				},
			]
		: [];
	const chain = {
		select: () => chain,
		from: () => chain,
		where: () => chain,
		limit: async () => rows,
	};
	return chain;
};

const makeCtx = ({
	allowedPaymentMethods,
	defaultNetTermsDays,
	template,
}: {
	allowedPaymentMethods?: InvoicePaymentMethod[] | null;
	defaultNetTermsDays?: number | null;
	template?: { net_terms_days: number | null };
}) =>
	({
		db: makeDb({ template }),
		org: {
			id: "org_123",
			config: {
				allowed_payment_methods: allowedPaymentMethods,
				default_invoice_net_terms_days: defaultNetTermsDays,
			},
		},
	}) as unknown as AutumnContext;

const makeParams = ({
	enabled = true,
	netTermsDays,
	invoiceTemplateId,
}: {
	enabled?: boolean;
	netTermsDays?: number;
	invoiceTemplateId?: string;
}) =>
	({
		invoice_mode: {
			enabled,
			enable_plan_immediately: false,
			finalize: true,
			net_terms_days: netTermsDays,
			invoice_template_id: invoiceTemplateId,
		},
	}) as unknown as AttachParamsV1;

describe("setupInvoiceModeContext payment method types", () => {
	test("falls back to the org config list", async () => {
		const invoiceMode = await setupInvoiceModeContext({
			ctx: makeCtx({ allowedPaymentMethods: ["card", "us_bank_account"] }),
			fullCustomer: { email: "billing@x.dev" } as never,
			params: makeParams({}),
		});

		expect(invoiceMode?.paymentMethodTypes).toEqual([
			"card",
			"us_bank_account",
		]);
	});

	test("stays undefined when nothing is configured", async () => {
		const invoiceMode = await setupInvoiceModeContext({
			ctx: makeCtx({ allowedPaymentMethods: null }),
			fullCustomer: { email: "billing@x.dev" } as never,
			params: makeParams({}),
		});

		expect(invoiceMode?.paymentMethodTypes).toBeUndefined();
	});

	test("returns no invoice mode when invoice mode is off", async () => {
		const invoiceMode = await setupInvoiceModeContext({
			ctx: makeCtx({ allowedPaymentMethods: ["card"] }),
			fullCustomer: { email: "billing@x.dev" } as never,
			params: makeParams({ enabled: false }),
		});

		expect(invoiceMode).toBeUndefined();
	});
});

describe("setupInvoiceModeContext net terms", () => {
	test("falls back to the org default when request and template are silent", async () => {
		const invoiceMode = await setupInvoiceModeContext({
			ctx: makeCtx({ defaultNetTermsDays: 45 }),
			fullCustomer: { email: "billing@x.dev" } as never,
			params: makeParams({}),
		});

		expect(invoiceMode?.daysUntilDue).toBe(45);
	});

	test("request net terms beat the org default", async () => {
		const invoiceMode = await setupInvoiceModeContext({
			ctx: makeCtx({ defaultNetTermsDays: 45 }),
			fullCustomer: { email: "billing@x.dev" } as never,
			params: makeParams({ netTermsDays: 7 }),
		});

		expect(invoiceMode?.daysUntilDue).toBe(7);
	});

	test("template net terms beat the org default", async () => {
		const invoiceMode = await setupInvoiceModeContext({
			ctx: makeCtx({
				defaultNetTermsDays: 45,
				template: { net_terms_days: 14 },
			}),
			fullCustomer: { email: "billing@x.dev" } as never,
			params: makeParams({ invoiceTemplateId: TEMPLATE_ID }),
		});

		expect(invoiceMode?.daysUntilDue).toBe(14);
	});

	test("a template without net terms falls through to the org default", async () => {
		const invoiceMode = await setupInvoiceModeContext({
			ctx: makeCtx({
				defaultNetTermsDays: 45,
				template: { net_terms_days: null },
			}),
			fullCustomer: { email: "billing@x.dev" } as never,
			params: makeParams({ invoiceTemplateId: TEMPLATE_ID }),
		});

		expect(invoiceMode?.daysUntilDue).toBe(45);
	});

	test("stays undefined when no org default is configured", async () => {
		const invoiceMode = await setupInvoiceModeContext({
			ctx: makeCtx({ defaultNetTermsDays: null }),
			fullCustomer: { email: "billing@x.dev" } as never,
			params: makeParams({}),
		});

		expect(invoiceMode?.daysUntilDue).toBeUndefined();
	});
});

describe("allowed_payment_methods org config schema", () => {
	test("rejects an empty array but allows null or omitted", () => {
		expect(
			OrgConfigSchema.safeParse({ allowed_payment_methods: [] }).success,
		).toBe(false);
		expect(
			OrgConfigSchema.parse({ allowed_payment_methods: null })
				.allowed_payment_methods,
		).toBeNull();
		expect(OrgConfigSchema.parse({}).allowed_payment_methods).toBeUndefined();
		expect(
			OrgConfigSchema.parse({ allowed_payment_methods: ["card"] })
				.allowed_payment_methods,
		).toEqual(["card"]);
	});
});

describe("default_invoice_net_terms_days org config schema", () => {
	test("rejects zero, negative and fractional values but allows null or omitted", () => {
		expect(
			OrgConfigSchema.safeParse({ default_invoice_net_terms_days: 0 }).success,
		).toBe(false);
		expect(
			OrgConfigSchema.safeParse({ default_invoice_net_terms_days: -1 }).success,
		).toBe(false);
		expect(
			OrgConfigSchema.safeParse({ default_invoice_net_terms_days: 1.5 })
				.success,
		).toBe(false);
		expect(
			OrgConfigSchema.parse({ default_invoice_net_terms_days: null })
				.default_invoice_net_terms_days,
		).toBeNull();
		expect(
			OrgConfigSchema.parse({}).default_invoice_net_terms_days,
		).toBeUndefined();
		expect(
			OrgConfigSchema.parse({ default_invoice_net_terms_days: 45 })
				.default_invoice_net_terms_days,
		).toBe(45);
	});
});

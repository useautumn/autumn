import { describe, expect, test } from "bun:test";
import type { AttachParamsV1, InvoicePaymentMethod } from "@autumn/shared";
import { InvoiceModeParamsSchema, OrgConfigSchema } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { setupInvoiceModeContext } from "@/internal/billing/v2/setup/setupInvoiceModeContext";

const makeCtx = ({
	allowedPaymentMethods,
}: {
	allowedPaymentMethods?: InvoicePaymentMethod[] | null;
}) =>
	({
		db: {},
		org: {
			id: "org_123",
			config: { allowed_payment_methods: allowedPaymentMethods },
		},
	}) as unknown as AutumnContext;

const makeParams = ({
	enabled = true,
	allowedPaymentMethods,
}: {
	enabled?: boolean;
	allowedPaymentMethods?: InvoicePaymentMethod[];
}) =>
	({
		invoice_mode: {
			enabled,
			enable_plan_immediately: false,
			finalize: true,
			allowed_payment_methods: allowedPaymentMethods,
		},
	}) as unknown as AttachParamsV1;

describe("setupInvoiceModeContext payment method types", () => {
	test("falls back to the org config list", async () => {
		const invoiceMode = await setupInvoiceModeContext({
			ctx: makeCtx({ allowedPaymentMethods: ["card", "us_bank_account"] }),
			params: makeParams({}),
		});

		expect(invoiceMode?.paymentMethodTypes).toEqual([
			"card",
			"us_bank_account",
		]);
	});

	test("per-attach override beats the org config", async () => {
		const invoiceMode = await setupInvoiceModeContext({
			ctx: makeCtx({ allowedPaymentMethods: ["card"] }),
			params: makeParams({ allowedPaymentMethods: ["sepa_debit"] }),
		});

		expect(invoiceMode?.paymentMethodTypes).toEqual(["sepa_debit"]);
	});

	test("stays undefined when nothing is configured", async () => {
		const invoiceMode = await setupInvoiceModeContext({
			ctx: makeCtx({ allowedPaymentMethods: null }),
			params: makeParams({}),
		});

		expect(invoiceMode?.paymentMethodTypes).toBeUndefined();
	});

	test("returns no invoice mode when invoice mode is off", async () => {
		const invoiceMode = await setupInvoiceModeContext({
			ctx: makeCtx({ allowedPaymentMethods: ["card"] }),
			params: makeParams({ enabled: false }),
		});

		expect(invoiceMode).toBeUndefined();
	});
});

describe("allowed_payment_methods schemas reject empty lists", () => {
	test("org config rejects an empty array but allows null or omitted", () => {
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

	test("invoice mode params reject an empty array but allow omitted", () => {
		expect(
			InvoiceModeParamsSchema.safeParse({
				enabled: true,
				allowed_payment_methods: [],
			}).success,
		).toBe(false);
		expect(
			InvoiceModeParamsSchema.parse({ enabled: true }).allowed_payment_methods,
		).toBeUndefined();
		expect(
			InvoiceModeParamsSchema.parse({
				enabled: true,
				allowed_payment_methods: ["sepa_debit"],
			}).allowed_payment_methods,
		).toEqual(["sepa_debit"]);
	});
});

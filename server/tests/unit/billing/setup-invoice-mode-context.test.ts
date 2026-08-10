import { describe, expect, test } from "bun:test";
import type { AttachParamsV1, InvoicePaymentMethod } from "@autumn/shared";
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

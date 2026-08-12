import { describe, expect, test } from "bun:test";
import type { AttachParamsV1, InvoicePaymentMethod } from "@autumn/shared";
import { OrgConfigSchema } from "@autumn/shared";
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

const makeParams = ({ enabled = true }: { enabled?: boolean }) =>
	({
		invoice_mode: {
			enabled,
			enable_plan_immediately: false,
			finalize: true,
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

import { afterEach, beforeEach, expect, mock, spyOn, test } from "bun:test";
import { InvoiceStatus } from "@autumn/shared";
import { InvoiceService } from "@/internal/invoices/InvoiceService.js";
import { completeInvoiceCheckoutV2 } from "../../utils/browserPool/completeInvoiceCheckoutV2";
import { playwrightPool } from "../../utils/browserPool/playwrightPool";
import * as openInvoice from "../../utils/stripeUtils/openStripeInvoiceId";
import * as invoicePayment from "../../utils/stripeUtils/payOpenInvoice";
import type { TestContext } from "../../utils/testInitUtils/createTestContext";

// Stripe and Autumn both already record the invoice as paid; only the browser path varies per test.
const paidInvoiceCtx = {
	stripeCli: { invoices: { retrieve: async () => ({ status: "paid" }) } },
} as unknown as TestContext;

beforeEach(() => {
	spyOn(openInvoice, "openStripeInvoiceId").mockResolvedValue("in_fixture");
	spyOn(InvoiceService, "getByStripeId").mockResolvedValue({
		status: InvoiceStatus.Paid,
	} as Awaited<ReturnType<typeof InvoiceService.getByStripeId>>);
});
afterEach(() => mock.restore());
const params = {
	url: "https://invoice.fixture",
	ctx: paidInvoiceCtx,
	customerId: "customer_fixture",
};

test("browser failures cannot be hidden by paying through the API", async () => {
	const failure = new Error("Payment frame detached");
	spyOn(playwrightPool, "runInPage").mockRejectedValue(failure);
	const pay = spyOn(invoicePayment, "payOpenInvoice").mockResolvedValue(
		"in_fixture",
	);
	await expect(completeInvoiceCheckoutV2(params)).rejects.toBe(failure);
	expect(pay).not.toHaveBeenCalled();
});

test("only an explicit external challenge retains the existing API fallback", async () => {
	const failure = new Error("Stripe requires a CAPTCHA");
	failure.name = "StripeBrowserChallengeError";
	spyOn(playwrightPool, "runInPage").mockRejectedValue(failure);
	const pay = spyOn(invoicePayment, "payOpenInvoice").mockResolvedValue(
		"in_fixture",
	);
	await completeInvoiceCheckoutV2(params);
	expect(pay).toHaveBeenCalledWith({
		ctx: params.ctx,
		customerId: params.customerId,
	});
});

test("a page that never confirms still completes once Stripe and Autumn record the payment", async () => {
	spyOn(playwrightPool, "runInPage").mockResolvedValue(undefined);
	const pay = spyOn(invoicePayment, "payOpenInvoice").mockResolvedValue(
		"in_fixture",
	);
	await completeInvoiceCheckoutV2(params);
	expect(pay).not.toHaveBeenCalled();
});

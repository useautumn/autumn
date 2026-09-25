import { afterEach, expect, mock, spyOn, test } from "bun:test";
import { completeInvoiceCheckoutV2 } from "../../utils/browserPool/completeInvoiceCheckoutV2";
import { playwrightPool } from "../../utils/browserPool/playwrightPool";
import * as invoicePayment from "../../utils/stripeUtils/payOpenInvoice";
import type { TestContext } from "../../utils/testInitUtils/createTestContext";

afterEach(() => mock.restore());
const params = {
	url: "https://invoice.fixture",
	ctx: {} as TestContext,
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

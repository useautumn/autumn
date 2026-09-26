import { describe, expect, test } from "bun:test";
import Stripe from "stripe";
import { retrieveStripeInvoiceIfExists } from "@/external/stripe/invoices/operations/retrieveStripeInvoiceIfExists";

const buildStripeCli = (retrieve: () => Promise<unknown>) =>
	({ invoices: { retrieve } }) as unknown as Stripe;

const buildInvalidRequestError = (code: string) =>
	new Stripe.errors.StripeInvalidRequestError({
		type: "invalid_request_error",
		code,
		message: code,
	});

describe("retrieveStripeInvoiceIfExists", () => {
	test("returns the invoice when it exists", async () => {
		const invoice = { id: "in_test", status: "draft" };
		const result = await retrieveStripeInvoiceIfExists({
			stripeCli: buildStripeCli(async () => invoice),
			stripeInvoiceId: "in_test",
		});
		expect(result).toEqual(invoice as unknown as Stripe.Invoice);
	});

	test("returns undefined for a deleted invoice", async () => {
		const result = await retrieveStripeInvoiceIfExists({
			stripeCli: buildStripeCli(async () => {
				throw buildInvalidRequestError("resource_missing");
			}),
			stripeInvoiceId: "in_deleted",
		});
		expect(result).toBeUndefined();
	});

	test("rethrows any other Stripe error", async () => {
		const promise = retrieveStripeInvoiceIfExists({
			stripeCli: buildStripeCli(async () => {
				throw buildInvalidRequestError("parameter_invalid_empty");
			}),
			stripeInvoiceId: "in_test",
		});
		await expect(promise).rejects.toBeInstanceOf(
			Stripe.errors.StripeInvalidRequestError,
		);
	});
});

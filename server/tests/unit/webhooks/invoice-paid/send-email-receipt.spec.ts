/**
 * Unit tests for sendEmailReceipt function.
 *
 * Tests the logic that sets receipt_email on PaymentIntent
 * based on customer's should_send_email_receipts flag.
 */

import { describe, expect, test } from "bun:test";
import { AppEnv, type FullCustomer } from "@autumn/shared";
import { stripeClients } from "@tests/utils/fixtures/stripe/clients";
import chalk from "chalk";
import type { StripeInvoicePaidContext } from "@/external/stripe/webhookHandlers/handleStripeInvoicePaid/setupStripeInvoicePaidContext";
import { sendEmailReceipt } from "@/external/stripe/webhookHandlers/handleStripeInvoicePaid/tasks/sendEmailReceipt";
import type { StripeWebhookContext } from "@/external/stripe/webhookMiddlewares/stripeWebhookContext";

// ============ MOCK HELPERS ============

const createMockLogger = () => ({
	debug: () => {},
	info: () => {},
	warn: () => {},
});

const createMockFullCustomer = (
	overrides: Partial<FullCustomer> = {},
): FullCustomer => ({
	id: "cus_test",
	internal_id: "cus_internal_test",
	name: "Test Customer",
	email: "test@example.com",
	fingerprint: null,
	org_id: "org_test",
	created_at: Date.now(),
	env: AppEnv.Sandbox,
	processor: { type: "stripe", id: "cus_stripe_test" },
	processors: null,
	metadata: {},
	customer_products: [],
	entities: [],
	extra_customer_entitlements: [],
	should_send_email_receipts: true,
	...overrides,
});

const createMockInvoicePaidContext = (
	paymentIntentId?: string,
): StripeInvoicePaidContext =>
	({
		stripeInvoice: {
			id: "inv_test",
			payments: paymentIntentId
				? {
						data: [
							{
								payment: { payment_intent: paymentIntentId },
							},
						],
					}
				: { data: [] },
		},
	}) as unknown as StripeInvoicePaidContext;

// ============ TESTS ============

describe(chalk.yellowBright("sendEmailReceipt"), () => {
	describe(chalk.cyan("Early returns - no Stripe API calls"), () => {
		test("returns when no fullCustomer", async () => {
			const mockCli = stripeClients.createMockPaymentIntentsClient();
			const ctx = {
				stripeCli: mockCli,
				logger: createMockLogger(),
				fullCustomer: undefined,
			} as unknown as StripeWebhookContext;

			await sendEmailReceipt({
				ctx,
				invoicePaidContext: createMockInvoicePaidContext("pi_123"),
			});

			expect(mockCli._calls.retrieve).toHaveLength(0);
			expect(mockCli._calls.update).toHaveLength(0);
		});

		test("returns when should_send_email_receipts is false", async () => {
			const mockCli = stripeClients.createMockPaymentIntentsClient();
			const ctx = {
				stripeCli: mockCli,
				logger: createMockLogger(),
				fullCustomer: createMockFullCustomer({
					should_send_email_receipts: false,
				}),
			} as unknown as StripeWebhookContext;

			await sendEmailReceipt({
				ctx,
				invoicePaidContext: createMockInvoicePaidContext("pi_123"),
			});

			expect(mockCli._calls.retrieve).toHaveLength(0);
			expect(mockCli._calls.update).toHaveLength(0);
		});

		test("returns when should_send_email_receipts is undefined", async () => {
			const mockCli = stripeClients.createMockPaymentIntentsClient();
			const ctx = {
				stripeCli: mockCli,
				logger: createMockLogger(),
				fullCustomer: createMockFullCustomer({
					should_send_email_receipts: undefined as unknown as boolean,
				}),
			} as unknown as StripeWebhookContext;

			await sendEmailReceipt({
				ctx,
				invoicePaidContext: createMockInvoicePaidContext("pi_123"),
			});

			expect(mockCli._calls.retrieve).toHaveLength(0);
			expect(mockCli._calls.update).toHaveLength(0);
		});

		test("returns when customer has no email", async () => {
			const mockCli = stripeClients.createMockPaymentIntentsClient();
			const ctx = {
				stripeCli: mockCli,
				logger: createMockLogger(),
				fullCustomer: createMockFullCustomer({
					email: undefined as unknown as string,
				}),
			} as unknown as StripeWebhookContext;

			await sendEmailReceipt({
				ctx,
				invoicePaidContext: createMockInvoicePaidContext("pi_123"),
			});

			expect(mockCli._calls.retrieve).toHaveLength(0);
			expect(mockCli._calls.update).toHaveLength(0);
		});

		test("returns when customer has empty string email", async () => {
			const mockCli = stripeClients.createMockPaymentIntentsClient();
			const ctx = {
				stripeCli: mockCli,
				logger: createMockLogger(),
				fullCustomer: createMockFullCustomer({ email: "" }),
			} as unknown as StripeWebhookContext;

			await sendEmailReceipt({
				ctx,
				invoicePaidContext: createMockInvoicePaidContext("pi_123"),
			});

			expect(mockCli._calls.retrieve).toHaveLength(0);
			expect(mockCli._calls.update).toHaveLength(0);
		});

		test("returns when invoice has no payments", async () => {
			const mockCli = stripeClients.createMockPaymentIntentsClient();
			const ctx = {
				stripeCli: mockCli,
				logger: createMockLogger(),
				fullCustomer: createMockFullCustomer(),
			} as unknown as StripeWebhookContext;

			await sendEmailReceipt({
				ctx,
				invoicePaidContext: createMockInvoicePaidContext(undefined),
			});

			expect(mockCli._calls.retrieve).toHaveLength(0);
			expect(mockCli._calls.update).toHaveLength(0);
		});
	});

	describe(chalk.cyan("PaymentIntent already has receipt_email"), () => {
		test("returns without updating when receipt_email already set", async () => {
			const mockCli = stripeClients.createMockPaymentIntentsClient({
				retrieveResult: { receipt_email: "existing@example.com" },
			});
			const ctx = {
				stripeCli: mockCli,
				logger: createMockLogger(),
				fullCustomer: createMockFullCustomer(),
			} as unknown as StripeWebhookContext;

			await sendEmailReceipt({
				ctx,
				invoicePaidContext: createMockInvoicePaidContext("pi_123"),
			});

			expect(mockCli._calls.retrieve).toHaveLength(1);
			expect(mockCli._calls.update).toHaveLength(0);
		});
	});

	describe(chalk.cyan("Success - sets receipt_email"), () => {
		test("updates PaymentIntent with customer email when all conditions met", async () => {
			const mockCli = stripeClients.createMockPaymentIntentsClient({
				retrieveResult: { receipt_email: null },
			});
			const customerEmail = "customer@example.com";
			const ctx = {
				stripeCli: mockCli,
				logger: createMockLogger(),
				fullCustomer: createMockFullCustomer({ email: customerEmail }),
			} as unknown as StripeWebhookContext;

			await sendEmailReceipt({
				ctx,
				invoicePaidContext: createMockInvoicePaidContext("pi_123"),
			});

			expect(mockCli._calls.retrieve).toHaveLength(1);
			expect(mockCli._calls.retrieve[0]).toBe("pi_123");
			expect(mockCli._calls.update).toHaveLength(1);
			expect(mockCli._calls.update[0].id).toBe("pi_123");
			expect(mockCli._calls.update[0].params.receipt_email).toBe(customerEmail);
		});
	});

	describe(chalk.cyan("Error handling"), () => {
		test("does not throw when paymentIntents.retrieve fails", async () => {
			const mockCli = stripeClients.createMockPaymentIntentsClient({
				retrieveError: new Error("Stripe API error"),
			});
			const ctx = {
				stripeCli: mockCli,
				logger: createMockLogger(),
				fullCustomer: createMockFullCustomer(),
			} as unknown as StripeWebhookContext;

			await sendEmailReceipt({
				ctx,
				invoicePaidContext: createMockInvoicePaidContext("pi_123"),
			});

			expect(mockCli._calls.retrieve).toHaveLength(1);
			expect(mockCli._calls.update).toHaveLength(0);
		});

		test("does not throw when paymentIntents.update fails", async () => {
			const mockCli = stripeClients.createMockPaymentIntentsClient({
				retrieveResult: { receipt_email: null },
				updateError: new Error("Stripe API error"),
			});
			const ctx = {
				stripeCli: mockCli,
				logger: createMockLogger(),
				fullCustomer: createMockFullCustomer(),
			} as unknown as StripeWebhookContext;

			await sendEmailReceipt({
				ctx,
				invoicePaidContext: createMockInvoicePaidContext("pi_123"),
			});

			expect(mockCli._calls.retrieve).toHaveLength(1);
			expect(mockCli._calls.update).toHaveLength(1);
		});
	});
});

/**
 * Unit tests for voidInvoicesForSubscriptionDeleted function.
 *
 * Tests the logic that voids open invoices when a subscription is deleted,
 * based on the org's void_invoices_on_subscription_deletion config.
 */

import { describe, expect, test } from "bun:test";
import { stripeClients } from "@tests/utils/fixtures/stripe/clients";
import chalk from "chalk";
import type Stripe from "stripe";
import type { StripeSubscriptionDeletedContext } from "@/external/stripe/webhookHandlers/handleStripeSubscriptionDeleted/setupStripeSubscriptionDeletedContext";
import { voidInvoicesForSubscriptionDeleted } from "@/external/stripe/webhookHandlers/handleStripeSubscriptionDeleted/tasks/voidInvoicesForSubscriptionDeleted";
import type { StripeWebhookContext } from "@/external/stripe/webhookMiddlewares/stripeWebhookContext";

// ============ MOCK HELPERS ============

const createMockLogger = () => ({
	debug: () => {},
	info: () => {},
	warn: () => {},
});

const createMockOrg = (
	overrides: { void_invoices_on_subscription_deletion?: boolean } = {},
) => ({
	id: "org_test",
	config: {
		void_invoices_on_subscription_deletion:
			overrides.void_invoices_on_subscription_deletion ?? false,
	},
});

const createMockEventContext = (
	overrides: { stripeCustomerId?: string; stripeSubscriptionId?: string } = {},
): StripeSubscriptionDeletedContext =>
	({
		stripeSubscription: {
			id: overrides.stripeSubscriptionId ?? "sub_test",
			customer: {
				id: overrides.stripeCustomerId ?? "cus_test",
			},
		},
	}) as unknown as StripeSubscriptionDeletedContext;

// ============ TESTS ============

describe(chalk.yellowBright("voidInvoicesForSubscriptionDeleted"), () => {
	describe(chalk.cyan("Early returns - feature disabled"), () => {
		test("returns without API calls when void_invoices_on_subscription_deletion is false", async () => {
			const mockCli = stripeClients.createMockStripeClient();
			const ctx = {
				stripeCli: mockCli,
				logger: createMockLogger(),
				org: createMockOrg({ void_invoices_on_subscription_deletion: false }),
			} as unknown as StripeWebhookContext;

			await voidInvoicesForSubscriptionDeleted({
				ctx,
				eventContext: createMockEventContext(),
			});

			expect(mockCli._calls.invoices.list).toHaveLength(0);
			expect(mockCli._calls.invoices.voidInvoice).toHaveLength(0);
		});

		test("returns without API calls when void_invoices_on_subscription_deletion is undefined", async () => {
			const mockCli = stripeClients.createMockStripeClient();
			const ctx = {
				stripeCli: mockCli,
				logger: createMockLogger(),
				org: { id: "org_test", config: {} },
			} as unknown as StripeWebhookContext;

			await voidInvoicesForSubscriptionDeleted({
				ctx,
				eventContext: createMockEventContext(),
			});

			expect(mockCli._calls.invoices.list).toHaveLength(0);
			expect(mockCli._calls.invoices.voidInvoice).toHaveLength(0);
		});
	});

	describe(chalk.cyan("No invoices to void"), () => {
		test("calls list but not voidInvoice when no invoices exist", async () => {
			const mockCli = stripeClients.createMockStripeClient({
				invoices: {
					listResult: { data: [] } as Partial<Stripe.ApiList<Stripe.Invoice>>,
				},
			});
			const ctx = {
				stripeCli: mockCli,
				logger: createMockLogger(),
				org: createMockOrg({ void_invoices_on_subscription_deletion: true }),
			} as unknown as StripeWebhookContext;

			await voidInvoicesForSubscriptionDeleted({
				ctx,
				eventContext: createMockEventContext(),
			});

			expect(mockCli._calls.invoices.list).toHaveLength(1);
			expect(mockCli._calls.invoices.voidInvoice).toHaveLength(0);
		});
	});

	describe(chalk.cyan("Voiding invoices"), () => {
		test("voids only open invoices, skipping paid/draft/void statuses", async () => {
			const mockCli = stripeClients.createMockStripeClient({
				invoices: {
					listResult: {
						data: [
							stripeClients.createMockInvoice({
								id: "inv_open",
								status: "open",
							}),
							stripeClients.createMockInvoice({
								id: "inv_paid",
								status: "paid",
							}),
							stripeClients.createMockInvoice({
								id: "inv_draft",
								status: "draft",
							}),
							stripeClients.createMockInvoice({
								id: "inv_void",
								status: "void",
							}),
						],
					} as Partial<Stripe.ApiList<Stripe.Invoice>>,
				},
			});
			const ctx = {
				stripeCli: mockCli,
				logger: createMockLogger(),
				org: createMockOrg({ void_invoices_on_subscription_deletion: true }),
			} as unknown as StripeWebhookContext;

			await voidInvoicesForSubscriptionDeleted({
				ctx,
				eventContext: createMockEventContext(),
			});

			expect(mockCli._calls.invoices.list).toHaveLength(1);
			expect(mockCli._calls.invoices.voidInvoice).toHaveLength(1);
			expect(mockCli._calls.invoices.voidInvoice[0]).toBe("inv_open");
		});

		test("voids multiple open invoices", async () => {
			const mockCli = stripeClients.createMockStripeClient({
				invoices: {
					listResult: {
						data: [
							stripeClients.createMockInvoice({
								id: "inv_open_1",
								status: "open",
							}),
							stripeClients.createMockInvoice({
								id: "inv_open_2",
								status: "open",
							}),
							stripeClients.createMockInvoice({
								id: "inv_paid",
								status: "paid",
							}),
							stripeClients.createMockInvoice({
								id: "inv_open_3",
								status: "open",
							}),
						],
					} as Partial<Stripe.ApiList<Stripe.Invoice>>,
				},
			});
			const ctx = {
				stripeCli: mockCli,
				logger: createMockLogger(),
				org: createMockOrg({ void_invoices_on_subscription_deletion: true }),
			} as unknown as StripeWebhookContext;

			await voidInvoicesForSubscriptionDeleted({
				ctx,
				eventContext: createMockEventContext(),
			});

			expect(mockCli._calls.invoices.voidInvoice).toHaveLength(3);
			expect(mockCli._calls.invoices.voidInvoice).toContain("inv_open_1");
			expect(mockCli._calls.invoices.voidInvoice).toContain("inv_open_2");
			expect(mockCli._calls.invoices.voidInvoice).toContain("inv_open_3");
		});

		test("passes correct customer and subscription IDs to list", async () => {
			const mockCli = stripeClients.createMockStripeClient({
				invoices: {
					listResult: { data: [] } as Partial<Stripe.ApiList<Stripe.Invoice>>,
				},
			});
			const ctx = {
				stripeCli: mockCli,
				logger: createMockLogger(),
				org: createMockOrg({ void_invoices_on_subscription_deletion: true }),
			} as unknown as StripeWebhookContext;

			await voidInvoicesForSubscriptionDeleted({
				ctx,
				eventContext: createMockEventContext({
					stripeCustomerId: "cus_specific",
					stripeSubscriptionId: "sub_specific",
				}),
			});

			expect(mockCli._calls.invoices.list).toHaveLength(1);
			expect(mockCli._calls.invoices.list[0]).toEqual({
				customer: "cus_specific",
				subscription: "sub_specific",
			});
		});
	});

	describe(chalk.cyan("Error handling"), () => {
		test("does not throw when invoices.list fails", async () => {
			const mockCli = stripeClients.createMockStripeClient({
				invoices: {
					listError: new Error("Stripe API error"),
				},
			});
			const ctx = {
				stripeCli: mockCli,
				logger: createMockLogger(),
				org: createMockOrg({ void_invoices_on_subscription_deletion: true }),
			} as unknown as StripeWebhookContext;

			// Should not throw
			await voidInvoicesForSubscriptionDeleted({
				ctx,
				eventContext: createMockEventContext(),
			});

			expect(mockCli._calls.invoices.list).toHaveLength(1);
			expect(mockCli._calls.invoices.voidInvoice).toHaveLength(0);
		});

		test("does not throw when invoices.voidInvoice fails (uses Promise.allSettled)", async () => {
			const mockCli = stripeClients.createMockStripeClient({
				invoices: {
					listResult: {
						data: [
							stripeClients.createMockInvoice({
								id: "inv_open",
								status: "open",
							}),
						],
					} as Partial<Stripe.ApiList<Stripe.Invoice>>,
					voidInvoiceError: new Error("Stripe API error"),
				},
			});
			const ctx = {
				stripeCli: mockCli,
				logger: createMockLogger(),
				org: createMockOrg({ void_invoices_on_subscription_deletion: true }),
			} as unknown as StripeWebhookContext;

			// Should not throw due to Promise.allSettled
			await voidInvoicesForSubscriptionDeleted({
				ctx,
				eventContext: createMockEventContext(),
			});

			expect(mockCli._calls.invoices.list).toHaveLength(1);
			expect(mockCli._calls.invoices.voidInvoice).toHaveLength(1);
		});

		test("attempts to void all invoices even when some fail", async () => {
			const voidInvoiceCalls: string[] = [];

			const mockCli = {
				invoices: {
					list: async () => ({
						data: [
							stripeClients.createMockInvoice({
								id: "inv_open_1",
								status: "open",
							}),
							stripeClients.createMockInvoice({
								id: "inv_open_2",
								status: "open",
							}),
							stripeClients.createMockInvoice({
								id: "inv_open_3",
								status: "open",
							}),
						],
					}),
					voidInvoice: async (id: string) => {
						voidInvoiceCalls.push(id);
						if (id === "inv_open_2") {
							throw new Error("Failed to void inv_open_2");
						}
						return {} as Stripe.Invoice;
					},
				},
			};

			const ctx = {
				stripeCli: mockCli,
				logger: createMockLogger(),
				org: createMockOrg({ void_invoices_on_subscription_deletion: true }),
			} as unknown as StripeWebhookContext;

			// Should not throw due to Promise.allSettled
			await voidInvoicesForSubscriptionDeleted({
				ctx,
				eventContext: createMockEventContext(),
			});

			// All three invoices should have been attempted
			expect(voidInvoiceCalls).toHaveLength(3);
			expect(voidInvoiceCalls).toContain("inv_open_1");
			expect(voidInvoiceCalls).toContain("inv_open_2");
			expect(voidInvoiceCalls).toContain("inv_open_3");
		});
	});
});

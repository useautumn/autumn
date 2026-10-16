import { describe, expect, test } from "bun:test";
import type { BillingContext } from "@autumn/shared";
import { billingContextBillsWithoutCustomer } from "@/internal/approvals/facts/billing/billingContextBillsWithoutCustomer";

const context = (overrides: Partial<BillingContext>) =>
	overrides as BillingContext;

describe("billingContextBillsWithoutCustomer", () => {
	test("no card and no invoicing: only the customer can start the charge", () => {
		expect(
			billingContextBillsWithoutCustomer({ billingContext: context({}) }),
		).toBe(false);
	});

	test("a card on file is charged when the trial ends", () => {
		expect(
			billingContextBillsWithoutCustomer({
				billingContext: context({
					paymentMethod: { id: "pm_1" } as BillingContext["paymentMethod"],
				}),
			}),
		).toBe(true);
	});

	test("invoice mode sends an invoice when the trial ends", () => {
		expect(
			billingContextBillsWithoutCustomer({
				billingContext: context({
					invoiceMode: {
						finalizeInvoice: true,
						enableProductImmediately: true,
					},
				}),
			}),
		).toBe(true);
	});

	test("a send_invoice subscription invoices too", () => {
		expect(
			billingContextBillsWithoutCustomer({
				billingContext: context({
					subscriptionInvoiceTerms: { daysUntilDue: 30 },
				}),
			}),
		).toBe(true);
	});
});

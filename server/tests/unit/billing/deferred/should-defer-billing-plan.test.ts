import { describe, expect, test } from "bun:test";
import type { BillingContext, InvoiceMode } from "@autumn/shared";
import type Stripe from "stripe";
import { getDeferredBillingMetadataExpiresAt } from "@/internal/billing/v2/providers/stripe/execute/getDeferredBillingMetadataExpiresAt";
import { shouldDeferBillingPlan } from "@/internal/billing/v2/providers/stripe/utils/common/shouldDeferBillingPlan";

const buildBillingContext = ({
	invoiceMode,
	enablePlanImmediately,
}: {
	invoiceMode?: Partial<InvoiceMode>;
	enablePlanImmediately?: boolean;
}) =>
	({
		invoiceMode: invoiceMode && {
			finalizeInvoice: false,
			enableProductImmediately: false,
			...invoiceMode,
		},
		enablePlanImmediately,
	}) as unknown as BillingContext;

const buildInvoice = (status: Stripe.Invoice.Status) =>
	({ id: "in_test", status, due_date: null }) as unknown as Stripe.Invoice;

describe("shouldDeferBillingPlan", () => {
	const cases: {
		name: string;
		billingContext: BillingContext;
		status: Stripe.Invoice.Status;
		expected: boolean;
	}[] = [
		{
			name: "enable immediately + draft invoice defers until finalized",
			billingContext: buildBillingContext({
				invoiceMode: { enableProductImmediately: true },
			}),
			status: "draft",
			expected: true,
		},
		{
			name: "top-level enable_plan_immediately + draft invoice defers",
			billingContext: buildBillingContext({
				invoiceMode: {},
				enablePlanImmediately: true,
			}),
			status: "draft",
			expected: true,
		},
		{
			name: "enable immediately + finalized invoice activates now",
			billingContext: buildBillingContext({
				invoiceMode: { enableProductImmediately: true },
			}),
			status: "open",
			expected: false,
		},
		{
			name: "deferred invoice mode + finalized invoice defers until paid",
			billingContext: buildBillingContext({ invoiceMode: {} }),
			status: "open",
			expected: true,
		},
		{
			name: "paid invoice never defers",
			billingContext: buildBillingContext({ invoiceMode: {} }),
			status: "paid",
			expected: false,
		},
		{
			name: "no invoice mode + draft invoice does not defer",
			billingContext: buildBillingContext({}),
			status: "draft",
			expected: false,
		},
	];

	for (const { name, billingContext, status, expected } of cases) {
		test(name, () => {
			expect(
				shouldDeferBillingPlan({
					billingContext,
					latestStripeInvoice: buildInvoice(status),
				}),
			).toBe(expected);
		});
	}
});

describe("getDeferredBillingMetadataExpiresAt", () => {
	test("draft invoice never expires on its own", () => {
		expect(
			getDeferredBillingMetadataExpiresAt({
				deferredInvoiceMode: false,
				stripeInvoice: buildInvoice("draft"),
			}),
		).toBeNull();
	});
});

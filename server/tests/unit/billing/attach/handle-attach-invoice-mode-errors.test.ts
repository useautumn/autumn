/**
 * Invoice mode with an Autumn-managed no-card trial is accepted with default
 * invoice options and rejected with custom ones (they can't reach the invoice
 * sent at trial end). Stripe-run and revert trials are unaffected.
 */

import { expect, test } from "bun:test";
import type {
	AttachBillingContext,
	AttachParamsV1,
	InvoiceModeParams,
	TrialContext,
} from "@autumn/shared";
import { contexts } from "@tests/utils/fixtures/db/contexts";
import { handleAttachInvoiceModeErrors } from "@/internal/billing/v2/actions/attach/errors/handleAttachInvoiceModeErrors";

const ORG_DEFAULT_NET_TERMS_DAYS = 14;
const TRIAL_INVOICE_OPTIONS_ERROR =
	"Invoice mode with a no-card free trial sends a finalized invoice";

const noCardTrial = ({
	autumnManaged,
	onEnd,
}: {
	autumnManaged: boolean;
	onEnd?: TrialContext["onEnd"];
}): TrialContext => ({
	trialEndsAt: 1_760_000_000_000,
	appliesToBilling: true,
	cardRequired: false,
	autumnManaged,
	onEnd,
});

const DEFAULT_INVOICE_MODE: InvoiceModeParams = {
	enabled: true,
	enable_plan_immediately: false,
	finalize: true,
};

const validate = ({
	trialContext,
	invoiceModeParams,
}: {
	trialContext: TrialContext;
	invoiceModeParams: Partial<InvoiceModeParams>;
}) => {
	const org = contexts.createOrg();
	org.config.default_invoice_net_terms_days = ORG_DEFAULT_NET_TERMS_DAYS;

	return () =>
		handleAttachInvoiceModeErrors({
			ctx: contexts.create({ org }),
			billingContext: {
				planTiming: "immediate",
				invoiceMode: { finalizeInvoice: true, enableProductImmediately: false },
				trialContext,
			} as AttachBillingContext,
			params: {
				customer_id: "cus_test",
				plan_id: "pro",
				invoice_mode: { ...DEFAULT_INVOICE_MODE, ...invoiceModeParams },
			} as AttachParamsV1,
		});
};

test("Autumn-managed no-card trial accepts default invoice options", () => {
	expect(
		validate({
			trialContext: noCardTrial({ autumnManaged: true }),
			invoiceModeParams: {},
		}),
	).not.toThrow();
	expect(
		validate({
			trialContext: noCardTrial({ autumnManaged: true }),
			invoiceModeParams: {
				enable_plan_immediately: true,
				net_terms_days: ORG_DEFAULT_NET_TERMS_DAYS,
			},
		}),
	).not.toThrow();
});

test.each<[string, Partial<InvoiceModeParams>]>([
	["finalize: false", { finalize: false }],
	["custom net_terms_days", { net_terms_days: 45 }],
	["invoice_template_id", { invoice_template_id: "tmpl_123" }],
])("Autumn-managed no-card trial rejects %s", (_label, invoiceModeParams) => {
	expect(
		validate({
			trialContext: noCardTrial({ autumnManaged: true }),
			invoiceModeParams,
		}),
	).toThrow(TRIAL_INVOICE_OPTIONS_ERROR);
});

test("Stripe-run and revert trials keep custom invoice options", () => {
	const customOptions = { finalize: false, net_terms_days: 45 };
	expect(
		validate({
			trialContext: noCardTrial({ autumnManaged: false }),
			invoiceModeParams: customOptions,
		}),
	).not.toThrow();
	expect(
		validate({
			trialContext: noCardTrial({ autumnManaged: true, onEnd: "revert" }),
			invoiceModeParams: customOptions,
		}),
	).not.toThrow();
});

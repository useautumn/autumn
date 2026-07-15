import {
	type BillingContext,
	billingContextToCurrency,
	type StripeDiscountWithCoupon,
	type StripeInvoiceAction,
} from "@autumn/shared";
import {
	type PayInvoiceResult,
	payStripeInvoice,
} from "@server/internal/billing/v2/providers/stripe/utils/invoices/payStripeInvoice";
import {
	addStripeInvoiceLines,
	createStripeInvoice,
	finalizeStripeInvoice,
} from "@server/internal/billing/v2/providers/stripe/utils/invoices/stripeInvoiceOps";
import type { Stripe } from "stripe";
import { createStripeCli } from "@/external/connect/createStripeCli";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { mergeStripeMetadata } from "@/internal/billing/v2/providers/stripe/utils/common/mergeStripeMetadata";
import { shouldEnableStripeAutomaticTax } from "@/internal/billing/v2/providers/stripe/utils/tax/shouldEnableStripeAutomaticTax";

const stripeDiscountsToInvoiceParams = ({
	stripeDiscounts,
}: {
	stripeDiscounts: StripeDiscountWithCoupon[];
}): Stripe.InvoiceCreateParams["discounts"] => {
	return stripeDiscounts
		.filter((discount): discount is StripeDiscountWithCoupon & { id: string } =>
			Boolean(discount.id),
		)
		.map((discount) => ({ discount: discount.id }));
};

const invoiceLinesAllowStripeDiscounts = ({
	lines,
}: {
	lines: StripeInvoiceAction["addLineParams"]["lines"];
}) => lines.some((line) => line.discountable !== false);

export const createInvoiceForBilling = async ({
	ctx,
	billingContext,
	stripeInvoiceAction,
	options = {},
}: {
	ctx: AutumnContext;
	billingContext: BillingContext;
	stripeInvoiceAction: StripeInvoiceAction;
	options?: {
		skipSubscriptionLink?: boolean;
	};
}): Promise<PayInvoiceResult> => {
	const stripeCli = createStripeCli({ org: ctx.org, env: ctx.env });
	const { addLineParams } = stripeInvoiceAction;
	const { invoiceMode } = billingContext;

	const shouldFinalizeInvoice = invoiceMode
		? invoiceMode.finalizeInvoice
		: true;

	const isInvoiceMode = Boolean(invoiceMode);

	const collectionMethod = isInvoiceMode
		? "send_invoice"
		: "charge_automatically";

	const vercelInstallationId =
		billingContext.fullCustomer?.processors?.vercel?.installation_id;

	const invoiceMetadata = mergeStripeMetadata({
		userMetadata: billingContext.userMetadata,
		autumnMetadata: {
			autumn_billing_update: "true",
			autumn_invoice_mode: billingContext.invoiceMode ? "true" : "false",
			...(vercelInstallationId
				? {
						vercel_installation_id: vercelInstallationId,
						vercel_billing_plan_id: billingContext.fullProducts?.[0]?.id ?? "",
					}
				: {}),
		},
	});

	const wantsAutoTax = shouldEnableStripeAutomaticTax({ ctx, billingContext });
	const stripeSubId = options.skipSubscriptionLink
		? undefined
		: billingContext.stripeSubscription?.id;
	const invoiceDiscounts = invoiceLinesAllowStripeDiscounts({
		lines: addLineParams.lines,
	})
		? stripeDiscountsToInvoiceParams({
				stripeDiscounts: billingContext.stripeDiscounts ?? [],
			})
		: undefined;

	const draftInvoice = await createStripeInvoice({
		stripeCli,
		stripeCusId: billingContext.stripeCustomer?.id ?? "none",
		stripeSubId,
		// Subscription-linked invoices inherit currency from the subscription;
		// standalone invoices default to the account currency, not the org's.
		currency: stripeSubId
			? undefined
			: billingContextToCurrency({ org: ctx.org, billingContext }),
		collectionMethod,
		daysUntilDue: invoiceMode?.daysUntilDue,
		footer: invoiceMode?.footer,
		description: invoiceMode?.memo,
		metadata: invoiceMetadata,
		discounts: invoiceDiscounts,
		automaticTax: wantsAutoTax,
		defaultTaxRates: billingContext.taxRateId
			? [billingContext.taxRateId]
			: undefined,
	});

	const invoiceWithLines = await addStripeInvoiceLines({
		stripeCli,
		invoiceId: draftInvoice.id,
		lines: addLineParams.lines,
	});

	if (!shouldFinalizeInvoice) {
		return { paid: false, invoice: invoiceWithLines };
	}

	const finalizedInvoice = await finalizeStripeInvoice({
		stripeCli,
		invoiceId: invoiceWithLines.id,
	});

	if (finalizedInvoice.status === "paid") {
		return { paid: true, invoice: finalizedInvoice };
	}

	if (isInvoiceMode) {
		return { paid: false, invoice: finalizedInvoice };
	}

	return payStripeInvoice({
		stripeCli,
		invoice: finalizedInvoice,
		paymentMethod: billingContext.paymentMethod,
	});
};

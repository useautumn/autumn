import type {
	BillingContext,
	StripeDiscountWithCoupon,
	StripeInvoiceAction,
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

const stripeDiscountsToInvoiceParams = ({
	stripeDiscounts,
}: {
	stripeDiscounts: StripeDiscountWithCoupon[];
}): Stripe.InvoiceCreateParams["discounts"] => {
	return stripeDiscounts.map((discount) => {
		if (discount.id) return { discount: discount.id };
		if (discount.promotionCodeId)
			return { promotion_code: discount.promotionCodeId };
		return { coupon: discount.source.coupon.id };
	});
};

const getInvoiceEligibleStripeDiscounts = ({
	stripeDiscounts,
}: {
	stripeDiscounts: StripeDiscountWithCoupon[];
}) => {
	return stripeDiscounts.filter((discount) => {
		if (discount.id) return true;

		return discount.source.coupon.duration !== "repeating";
	});
};

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

	const invoiceMetadata = mergeStripeMetadata({
		userMetadata: billingContext.userMetadata,
		autumnMetadata: {
			autumn_billing_update: "true",
			autumn_invoice_mode: billingContext.invoiceMode ? "true" : "false",
		},
	});

	const invoiceEligibleStripeDiscounts = getInvoiceEligibleStripeDiscounts({
		stripeDiscounts: billingContext.stripeDiscounts ?? [],
	});

	const draftInvoice = await createStripeInvoice({
		stripeCli,
		stripeCusId: billingContext.stripeCustomer?.id ?? "none",
		stripeSubId: options.skipSubscriptionLink
			? undefined
			: billingContext.stripeSubscription?.id,
		collectionMethod,
		metadata: invoiceMetadata,
		discounts: stripeDiscountsToInvoiceParams({
			stripeDiscounts: invoiceEligibleStripeDiscounts,
		}),
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

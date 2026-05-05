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

const subscriptionPaymentSettingsToInvoiceParams = ({
	stripeSubscription,
}: {
	stripeSubscription?: Stripe.Subscription;
}): Stripe.InvoiceCreateParams["payment_settings"] | undefined => {
	const paymentSettings = stripeSubscription?.payment_settings;
	const paymentMethodTypes = paymentSettings?.payment_method_types;
	const paymentMethodOptions = paymentSettings?.payment_method_options;

	if (!paymentMethodTypes?.length && !paymentMethodOptions) return undefined;

	return {
		...(paymentMethodTypes?.length && {
			payment_method_types: paymentMethodTypes,
		}),
		...(paymentMethodOptions && {
			payment_method_options:
				paymentMethodOptions as Stripe.InvoiceCreateParams.PaymentSettings.PaymentMethodOptions,
		}),
	};
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
	const paymentSettings = subscriptionPaymentSettingsToInvoiceParams({
		stripeSubscription: billingContext.stripeSubscription,
	});

	// Skip auto_tax in invoice mode: send_invoice has no address-collection
	// UI so Stripe Tax rejects. charge_automatically relies on Stripe's
	// address waterfall.
	const wantsAutoTax = !!ctx.org.config.automatic_tax && !isInvoiceMode;
	const draftInvoice = await createStripeInvoice({
		stripeCli,
		stripeCusId: billingContext.stripeCustomer?.id ?? "none",
		stripeSubId: options.skipSubscriptionLink
			? undefined
			: billingContext.stripeSubscription?.id,
		collectionMethod,
		paymentSettings,
		metadata: invoiceMetadata,
		discounts: stripeDiscountsToInvoiceParams({
			stripeDiscounts: invoiceEligibleStripeDiscounts,
		}),
		automaticTax: wantsAutoTax,
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

import {
	ErrCode,
	type InvoiceDiscount,
	type InvoiceStatus,
	notNullish,
	stripeToAtmnAmount,
} from "@autumn/shared";
import type Stripe from "stripe";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { InvoiceService } from "@/internal/invoices/InvoiceService.js";
import RecaseError from "@/utils/errorUtils.js";

// For API calls
export const getStripeExpandedInvoice = async ({
	stripeCli,
	stripeInvoiceId,
}: {
	stripeCli: Stripe;
	stripeInvoiceId: string;
}) => {
	const invoice = await stripeCli.invoices.retrieve(stripeInvoiceId, {
		expand: ["discounts", "discounts.coupon"],
	});
	return invoice;
};

// For webhooks
export const getFullStripeInvoice = async ({
	stripeCli,
	stripeId,
	expand = [],
}: {
	stripeCli: Stripe;
	stripeId: string;
	expand?: string[];
}) => {
	const invoice = await stripeCli.invoices.retrieve(stripeId, {
		expand: [...expand, "discounts", "discounts.coupon"],
	});

	return invoice;
};

export const invoiceToSubId = ({ invoice }: { invoice: Stripe.Invoice }) => {
	const subId = invoice.parent?.subscription_details?.subscription;
	return subId as string | undefined;
};

export const payForInvoice = async ({
	stripeCli,
	paymentMethod,
	invoiceId,
	logger,
	errorOnFail = true,
	voidIfFailed = false,
}: {
	stripeCli: Stripe;
	paymentMethod?: Stripe.PaymentMethod | null;
	invoiceId: string;
	logger: any;
	errorOnFail?: boolean;
	voidIfFailed?: boolean;
}) => {
	if (!paymentMethod) {
		if (errorOnFail) {
			throw new RecaseError({
				message: "No payment method found",
				code: ErrCode.CustomerHasNoPaymentMethod,
				statusCode: 400,
			});
		} else {
			return {
				paid: false,
				error: new RecaseError({
					message: "No payment method found",
					code: ErrCode.CustomerHasNoPaymentMethod,
					statusCode: 400,
				}),
				invoice: null,
			};
		}
	}

	const invoice = await stripeCli.invoices.retrieve(invoiceId);
	if (invoice.status === "paid") {
		logger.info(`Invoice ${invoiceId} is already paid`);
		return {
			paid: true,
			error: null,
			invoice,
		};
	}

	try {
		const invoice = await stripeCli.invoices.pay(invoiceId, {
			payment_method: paymentMethod?.id,
		});
		return {
			paid: true,
			error: null,
			invoice,
		};
	} catch (error: any) {
		logger.error(
			`❌ Stripe error: Failed to pay invoice: ${error?.message || error}`,
		);

		if (voidIfFailed) {
			try {
				await stripeCli.invoices.voidInvoice(invoiceId);
			} catch (_error) {
				logger.error(`Failed to void failed invoice: ${invoiceId}`);
			}
		}

		if (errorOnFail) {
			throw error;
		} else {
			return {
				paid: false,
				error: new RecaseError({
					message: `Failed to pay invoice: ${error?.message || error}`,
					code: ErrCode.PayInvoiceFailed,
				}),
				invoice: null,
			};
		}
	}
};

export const updateInvoiceIfExists = async ({
	db,
	invoice,
}: {
	db: DrizzleCli;
	invoice: Stripe.Invoice;
}) => {
	// TODO: Can optimize this function...
	const existingInvoice = await InvoiceService.getByStripeId({
		db,
		stripeId: invoice.id!,
	});

	if (existingInvoice) {
		await InvoiceService.updateByStripeId({
			db,
			stripeId: invoice.id!,
			updates: {
				status: invoice.status as InvoiceStatus,
				hosted_invoice_url: invoice.hosted_invoice_url,
			},
		});

		return true;
	}

	return false;
};

export const getInvoiceDiscounts = ({
	expandedInvoice,
}: {
	expandedInvoice: Stripe.Invoice;
}) => {
	if (!expandedInvoice.discounts || expandedInvoice.discounts.length === 0) {
		return [];
	}

	if (typeof expandedInvoice.discounts[0] === "string") {
		return [];
	}

	const totalDiscountAmounts = expandedInvoice.total_discount_amounts;
	const autumnDiscounts = expandedInvoice.discounts
		.map((discount) => {
			if (typeof discount === "string") return null;

			const amountOff = totalDiscountAmounts?.find(
				(item) => item.discount === discount.id,
			)?.amount;

			if (!amountOff) return null;

			const amountUsed = totalDiscountAmounts?.find(
				(item) => item.discount === discount.id,
			)?.amount;

			const atmnAmountOff = stripeToAtmnAmount({
				amount: amountOff,
				currency: expandedInvoice.currency,
			});

			const atmnAmountUsed = stripeToAtmnAmount({
				amount: amountUsed || 0,
				currency: expandedInvoice.currency,
			});

			const autumnDiscount: InvoiceDiscount = {
				stripe_coupon_id: discount.coupon?.id,
				coupon_name: discount.coupon?.name || "",
				amount_off: atmnAmountOff,
				amount_used: atmnAmountUsed,
			};

			return autumnDiscount;
		})
		.filter(notNullish);

	return autumnDiscounts;
};

export const getInvoiceExpansion = () => {
	return {
		expand: ["discounts", "discounts.coupon"],
	};
};

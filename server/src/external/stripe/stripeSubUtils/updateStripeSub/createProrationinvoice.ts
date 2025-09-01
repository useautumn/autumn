import { ErrCode } from "@autumn/shared";
import type Stripe from "stripe";
import type { AttachParams } from "@/internal/customers/cusProducts/AttachParams.js";
import RecaseError from "@/utils/errorUtils.js";
import { payForInvoice } from "../../stripeInvoiceUtils.js";

export const undoSubUpdate = async ({
	stripeCli,
	curSub,
	updatedSub,
}: {
	stripeCli: Stripe;
	curSub: Stripe.Subscription;
	updatedSub: Stripe.Subscription;
}) => {
	const prevItems = curSub.items.data.map((item) => {
		return {
			price: item.price.id,
			quantity: item.quantity,
		};
	});

	const deleteNewItems = updatedSub.items.data
		.filter(
			(item) =>
				!prevItems.some((_prevItem) =>
					curSub.items.data.some(
						(curItem) => curItem.price.id === item.price.id,
					),
				),
		)
		.map((item) => {
			return {
				id: item.id,
				deleted: true,
			};
		});

	await stripeCli.subscriptions.update(curSub.id, {
		items: [...prevItems, ...deleteNewItems],
		proration_behavior: "none",
	});
};

export const createProrationInvoice = async ({
	attachParams,
	invoiceOnly,
	curSub,
	updatedSub,
	logger,
}: {
	attachParams: AttachParams;
	invoiceOnly: boolean;
	curSub: Stripe.Subscription;
	updatedSub: Stripe.Subscription;
	logger: any;
}) => {
	const { stripeCli, customer, paymentMethod } = attachParams;

	const _proratedItems = [];
	// How to retrieve upcoming invoice items?
	const items = await stripeCli.invoiceItems.list({
		customer: customer.processor.id,
		pending: true,
	});

	if (items.data.length === 0) {
		logger.info(`No items to prorate, skipping invoice creation`);
		return null;
	}

	// const shouldMemo = attachParams.org.config.invoice_memos && invoiceOnly;
	// const invoiceMemo = shouldMemo
	//   ? await buildInvoiceMemoFromEntitlements({
	//       org: attachParams.org,
	//       entitlements: attachParams.entitlements,
	//       features: attachParams.features,
	//     })
	//   : undefined;

	const invoice = await stripeCli.invoices.create({
		customer: customer.processor.id,
		subscription: curSub.id,
		auto_advance: false,
		// ...(shouldMemo ? { description: invoiceMemo } : {}),
	});

	if (invoiceOnly) return invoice;

	await stripeCli.invoices.finalizeInvoice(invoice.id!, {
		auto_advance: false,
	});

	try {
		const { invoice: subInvoice } = await payForInvoice({
			stripeCli,
			paymentMethod: paymentMethod || null,
			invoiceId: invoice.id!,
			logger,
			voidIfFailed: true,
		});

		return subInvoice;
	} catch (error: any) {
		await undoSubUpdate({ stripeCli, curSub, updatedSub });

		throw new RecaseError({
			code: ErrCode.UpdateSubscriptionFailed,
			message: `Failed to update subscription. ${error.message}`,
			statusCode: 500,
			data: `Stripe error: ${error.message}`,
		});
	}
};

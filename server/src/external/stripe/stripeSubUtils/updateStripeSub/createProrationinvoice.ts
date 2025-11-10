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
	// For each price in the old subscription, find the corresponding item in the updated subscription
	// and update it back to the old quantity, or delete it if it doesn't exist in the old sub
	const itemsToUpdate = updatedSub.items.data.map((updatedItem) => {
		const oldItem = curSub.items.data.find(
			(item) => item.price.id === updatedItem.price.id,
		);

		if (oldItem) {
			// Item exists in both old and new - revert to old quantity
			return {
				id: updatedItem.id,
				price: oldItem.price.id,
				quantity: oldItem.quantity,
			};
		}
		// Item only exists in updated sub - delete it
		return {
			id: updatedItem.id,
			deleted: true,
		};
	});

	// For prices that existed in old sub but were removed in the update, we need to add them back
	const itemsToAdd = curSub.items.data
		.filter(
			(oldItem) =>
				!updatedSub.items.data.some(
					(updatedItem) => updatedItem.price.id === oldItem.price.id,
				),
		)
		.map((oldItem) => ({
			price: oldItem.price.id,
			quantity: oldItem.quantity,
		}));

	await stripeCli.subscriptions.update(curSub.id, {
		items: [...itemsToUpdate, ...itemsToAdd] as any,
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

	const proratedItems = [];
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

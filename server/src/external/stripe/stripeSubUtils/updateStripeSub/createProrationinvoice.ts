import { AttachBranch, InternalError, MetadataType } from "@autumn/shared";
import { addMinutes } from "date-fns";
import type Stripe from "stripe";
import type { AttachParams } from "@/internal/customers/cusProducts/AttachParams.js";
import type { AutumnContext } from "../../../../honoUtils/HonoEnv.js";
import { attachParamsToMetadata } from "../../../../internal/billing/attach/utils/attachParamsToMetadata.js";
import type { Logger } from "../../../logtail/logtailUtils.js";
import { payForInvoice } from "../../stripeInvoiceUtils.js";

const undoSubUpdate = async ({
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
	ctx,
	attachParams,
	invoiceOnly,
	curSub,
	updatedSub,
	branch,
	logger,
}: {
	ctx: AutumnContext;
	attachParams: AttachParams;
	invoiceOnly: boolean;
	curSub: Stripe.Subscription;
	updatedSub: Stripe.Subscription;
	branch: AttachBranch;
	logger: Logger;
}) => {
	const { stripeCli, customer, paymentMethod } = attachParams;

	// How to retrieve upcoming invoice items?
	const items = await stripeCli.invoiceItems.list({
		customer: customer.processor.id,
		pending: true,
	});

	if (items.data.length === 0) {
		logger.info(`No items to prorate, skipping invoice creation`);
		return {
			invoice: null,
			url: null,
		};
	}

	const invoice = await stripeCli.invoices.create({
		customer: customer.processor.id,
		auto_advance: false,
		pending_invoice_items_behavior: "include",
	});

	if (invoiceOnly)
		return {
			invoice,
			url: null,
		};

	const finalizedInvoice = await stripeCli.invoices.finalizeInvoice(
		invoice.id!,
		{
			auto_advance: false,
		},
	);

	logger.info(
		`[UPGRADE FLOW] Finalized invoice amount: ${finalizedInvoice.total}, Status: ${finalizedInvoice.status}`,
	);

	if (finalizedInvoice.status === "paid") {
		return {
			invoice: finalizedInvoice,
			url: null,
		};
	}

	const {
		paid,
		error,
		invoice: subInvoice,
	} = await payForInvoice({
		stripeCli,
		paymentMethod: paymentMethod || null,
		invoiceId: invoice.id!,
		logger,
		voidIfFailed: false,
		errorOnFail: false,
	});

	if (!paid && branch !== AttachBranch.Cancel) {
		await undoSubUpdate({ stripeCli, curSub, updatedSub });

		if (subInvoice && subInvoice.status === "open") {
			logger.info(
				`[update subscription] invoice action required: ${subInvoice.id}`,
			);
			const metadata = await attachParamsToMetadata({
				db: ctx.db,
				attachParams,
				type: MetadataType.InvoiceActionRequired,
				stripeInvoiceId: subInvoice.id,
				expiresAt: addMinutes(Date.now(), 10).getTime(),
			});

			await stripeCli.invoices.update(subInvoice.id, {
				metadata: {
					autumn_metadata_id: metadata.id,
				},
			});
			return {
				invoice: subInvoice,
				url: subInvoice?.hosted_invoice_url,
			};
		} else {
			throw new InternalError({
				message: `[update subscription] Failed to pay invoice: ${error?.message}`,
				code: "update_subscription_failed",
				statusCode: 500,
				data: error,
			});
		}
	}

	return {
		invoice: subInvoice,
		url: null,
	};
};

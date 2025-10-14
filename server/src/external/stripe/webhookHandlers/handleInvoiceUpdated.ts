import {
	type AppEnv,
	type Invoice,
	InvoiceStatus,
	stripeToAtmnAmount,
} from "@autumn/shared";
import { Decimal } from "decimal.js";
import type Stripe from "stripe";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { CusService } from "@/internal/customers/CusService.js";
import type { AttachParams } from "@/internal/customers/cusProducts/AttachParams.js";
import { InvoiceService } from "@/internal/invoices/InvoiceService.js";
import { MetadataService } from "@/internal/metadata/MetadataService.js";
import { getFullStripeInvoice, invoiceToSubId } from "../stripeInvoiceUtils.js";

const handleInvoiceCheckoutVoided = async ({
	db,
	stripeCli,
	invoiceObject,
	logger,
}: {
	db: DrizzleCli;
	stripeCli: Stripe;
	invoiceObject: Stripe.Invoice;
	logger: any;
}) => {
	const fullInvoice = await getFullStripeInvoice({
		stripeCli,
		stripeId: invoiceObject.id!,
	});

	const metadataId = fullInvoice.metadata?.autumn_metadata_id;

	if (!metadataId) return;

	const metadata = await MetadataService.get({
		db,
		id: metadataId,
	});

	const {
		anchorToUnix: _anchorToUnix,
		config: _config,
		...rest
	} = metadata?.data || {};

	const attachParams = rest as AttachParams;

	if (!attachParams) return;

	const customer = attachParams.customer;
	const fullCus = await CusService.getFull({
		db,
		idOrInternalId: customer.id || customer.internal_id,
		orgId: attachParams.org.id,
		env: attachParams.customer.env,
	});

	const subId = invoiceToSubId({ invoice: fullInvoice });

	if (!subId) return;

	const cusSubIds = fullCus.customer_products.flatMap(
		(cp) => cp.subscription_ids || [],
	);

	const subIdMatch = cusSubIds.includes(subId);

	if (subIdMatch) return;

	try {
		const sub = await stripeCli.subscriptions.retrieve(subId);

		if (sub.status !== "canceled") {
			console.log("Invoice checkout voided, cancelling sub:", subId);
			await stripeCli.subscriptions.cancel(subId);
		}
	} catch (error: any) {
		logger.warn(`Failed to cancel sub ${subId}, error: ${error?.message}`);
	}
};

export const handleInvoiceUpdated = async ({
	env,
	event,
	stripeCli,
	req,
}: {
	env: AppEnv;
	event: Stripe.Event;
	stripeCli: Stripe;
	req: any;
}) => {
	const invoiceObject = event.data.object as Stripe.Invoice;
	const currentInvoice = await InvoiceService.getByStripeId({
		db: req.db,
		stripeId: invoiceObject.id!,
	});

	// const invoice = await getFullStripeInvoice({
	//   stripeCli,
	//   stripeId: invoiceObject.id!,
	// });

	const prevAttributes = event.data.previous_attributes as any;

	const updates: Partial<Invoice> = {};

	if (invoiceObject.status === "void") {
		updates.status = InvoiceStatus.Void;
	}

	if (invoiceObject.status === "open") {
		updates.status = InvoiceStatus.Open;
	}

	if (currentInvoice) {
		const newAtmnTotal = stripeToAtmnAmount({
			amount: invoiceObject.total,
			currency: invoiceObject.currency,
		});

		const totalEquals = new Decimal(newAtmnTotal).eq(currentInvoice.total);

		if (!totalEquals) {
			updates.total = newAtmnTotal;
		}
	}

	if (Object.keys(updates).length > 0 && invoiceObject.id) {
		await InvoiceService.updateByStripeId({
			db: req.db,
			stripeId: invoiceObject.id,
			updates,
		});
	}
};

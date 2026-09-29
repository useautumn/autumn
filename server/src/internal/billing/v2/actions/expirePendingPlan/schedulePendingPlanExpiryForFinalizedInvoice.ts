import {
	type DeferredAutumnBillingPlanData,
	MetadataType,
} from "@autumn/shared";
import type Stripe from "stripe";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { getDeferredBillingMetadataExpiresAt } from "@/internal/billing/v2/providers/stripe/execute/getDeferredBillingMetadataExpiresAt";
import { MetadataService } from "@/internal/metadata/MetadataService";

/** A deferred draft had no due date to expire at; once finalized, its pending plan expires at the due date. */
export const schedulePendingPlanExpiryForFinalizedInvoice = async ({
	ctx,
	stripeInvoice,
}: {
	ctx: AutumnContext;
	stripeInvoice: Stripe.Invoice;
}) => {
	const metadata = await MetadataService.getByStripeInvoiceId({
		db: ctx.db,
		stripeInvoiceId: stripeInvoice.id,
		type: MetadataType.DeferredInvoice,
	});
	if (!metadata || metadata.expires_at) return;

	const data = metadata.data as DeferredAutumnBillingPlanData;
	const expiresAt = getDeferredBillingMetadataExpiresAt({
		deferredInvoiceMode: true,
		paymentMethod: data.billingContext?.paymentMethod,
		stripeInvoice,
	});
	if (!expiresAt) return;

	await MetadataService.update({
		db: ctx.db,
		id: metadata.id,
		updates: { expires_at: expiresAt },
	});
};

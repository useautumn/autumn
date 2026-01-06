import { generateId, InternalError, MetadataType } from "@autumn/shared";
import type Stripe from "stripe";
import { createStripeCli } from "@/external/connect/createStripeCli";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import type { BillingContext } from "@/internal/billing/v2/billingContext";
import type {
	BillingPlan,
	DeferredAutumnBillingPlanData,
} from "@/internal/billing/v2/types/billingPlan";
import { MetadataService } from "../MetadataService";

/**
 * Creates metadata from a billing plan and optionally links it to a Stripe invoice.
 */
export const insertMetadataFromBillingPlan = async ({
	ctx,
	billingPlan,
	billingContext,
	enableProductAfterInvoice,
	invoiceActionRequired,
	stripeInvoice,
}: {
	ctx: AutumnContext;
	billingPlan: BillingPlan;
	billingContext: BillingContext;
	enableProductAfterInvoice?: boolean;
	invoiceActionRequired?: boolean;
	stripeInvoice?: Stripe.Invoice;
}) => {
	const id = generateId("meta");

	const type = enableProductAfterInvoice
		? MetadataType.InvoiceCheckoutV2
		: invoiceActionRequired
			? MetadataType.InvoiceActionRequiredV2
			: undefined;

	const data = {
		orgId: ctx.org.id,
		env: ctx.env,
		billingPlan,
		billingContext,
	} satisfies DeferredAutumnBillingPlanData;

	const metadata = await MetadataService.insert({
		db: ctx.db,
		data: {
			id,
			type,
			stripe_invoice_id: stripeInvoice?.id,
			data,
		},
	});

	if (!metadata) {
		throw new InternalError({
			message: "Failed to insert metadata from billing plan",
		});
	}

	// If stripeInvoice, update stripeInvoice with metadata id
	if (stripeInvoice) {
		const stripeCli = createStripeCli({ org: ctx.org, env: ctx.env });
		await stripeCli.invoices.update(stripeInvoice.id, {
			metadata: {
				autumn_metadata_id: metadata.id,
			},
		});
	}

	return metadata;
};

import { InternalError, MetadataType } from "@autumn/shared";
import { addDays } from "date-fns";
import type Stripe from "stripe";
import { createStripeCli } from "@/external/connect/createStripeCli";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import type { BillingContext } from "@/internal/billing/v2/billingContext";
import type { StripeBillingStage } from "@/internal/billing/v2/types/autumnBillingPlan";
import type {
	BillingPlan,
	DeferredAutumnBillingPlanData,
} from "@/internal/billing/v2/types/billingPlan";
import { generateId } from "@/utils/genUtils";
import { MetadataService } from "../MetadataService";

/**
 * Creates metadata from a billing plan and optionally links it to a Stripe invoice.
 */
export const insertMetadataFromBillingPlan = async ({
	ctx,
	billingPlan,
	billingContext,
	stripeInvoice,
	expiresAt,
	resumeAfter,
}: {
	ctx: AutumnContext;
	billingPlan: BillingPlan;
	billingContext: BillingContext;
	stripeInvoice?: Stripe.Invoice;
	resumeAfter: StripeBillingStage;
	expiresAt: number;
}) => {
	const id = generateId("meta");

	const type = stripeInvoice ? MetadataType.DeferredInvoice : undefined;

	const data = {
		requestId: ctx.id,
		orgId: ctx.org.id,
		env: ctx.env,
		billingPlan,
		billingContext,
		resumeAfter,
	} satisfies DeferredAutumnBillingPlanData;

	const metadata = await MetadataService.insert({
		db: ctx.db,
		data: {
			id,
			type,
			stripe_invoice_id: stripeInvoice?.id,
			data,
			created_at: Date.now(),
			expires_at: expiresAt ?? addDays(Date.now(), 10).getTime(),
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

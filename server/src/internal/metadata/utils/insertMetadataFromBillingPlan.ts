import { InternalError, MetadataType } from "@autumn/shared";
import { addDays } from "date-fns";
import type Stripe from "stripe";
import { createStripeCli } from "@/external/connect/createStripeCli";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import type {
	BillingContext,
	BillingPlan,
	DeferredAutumnBillingPlanData,
	StripeBillingStage,
} from "@/internal/billing/v2/types";
import { generateId } from "@/utils/genUtils";
import { MetadataService } from "../MetadataService";

/**
 * Creates metadata from a billing plan and optionally links it to a Stripe invoice or checkout session.
 */
export const insertMetadataFromBillingPlan = async ({
	ctx,
	billingPlan,
	billingContext,
	stripeInvoice,
	stripeCheckoutSession,
	expiresAt,
	resumeAfter,
}: {
	ctx: AutumnContext;
	billingPlan: BillingPlan;
	billingContext: BillingContext;
	stripeInvoice?: Stripe.Invoice;
	stripeCheckoutSession?: Stripe.Checkout.Session;
	resumeAfter?: StripeBillingStage;
	expiresAt: number;
}) => {
	const id = generateId("meta");

	let type: MetadataType | undefined;
	if (stripeCheckoutSession) {
		type = MetadataType.CheckoutSessionV2;
	} else if (stripeInvoice) {
		type = MetadataType.DeferredInvoice;
	}

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
			stripe_checkout_session_id: stripeCheckoutSession?.id,
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

/**
 * Updates metadata with checkout session ID after checkout is created.
 */
export const updateMetadataWithCheckoutSession = async ({
	ctx,
	metadataId,
	stripeCheckoutSessionId,
}: {
	ctx: AutumnContext;
	metadataId: string;
	stripeCheckoutSessionId: string;
}) => {
	return MetadataService.update({
		db: ctx.db,
		id: metadataId,
		updates: {
			stripe_checkout_session_id: stripeCheckoutSessionId,
			type: MetadataType.CheckoutSessionV2,
		},
	});
};

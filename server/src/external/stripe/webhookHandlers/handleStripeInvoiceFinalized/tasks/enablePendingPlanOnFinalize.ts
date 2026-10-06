import {
	type DeferredAutumnBillingPlanData,
	InternalError,
	type Metadata,
	MetadataType,
} from "@autumn/shared";
import type Stripe from "stripe";
import type { StripeWebhookContext } from "@/external/stripe/webhookMiddlewares/stripeWebhookContext";
import { executeClaimedDeferredBillingPlan } from "@/internal/billing/v2/execute/executeClaimedDeferredBillingPlan";
import { isPlanEnabledOnFinalize } from "@/internal/billing/v2/utils/billingContext/isPlanEnabledOnFinalize";
import { MetadataService } from "@/internal/metadata/MetadataService";

/** An enable-immediately plan waits as pending while its invoice is a draft; finalizing it grants access. */
export const enablePendingPlanOnFinalize = async ({
	ctx,
	stripeInvoice,
}: {
	ctx: StripeWebhookContext;
	stripeInvoice: Stripe.Invoice;
}) => {
	const metadataId = stripeInvoice.metadata?.autumn_metadata_id;
	if (!metadataId) return;

	const metadata = await MetadataService.get({ db: ctx.db, id: metadataId });
	if (metadata?.type !== MetadataType.DeferredInvoice) return;

	const { billingContext } = metadata.data as DeferredAutumnBillingPlanData;
	if (!isPlanEnabledOnFinalize({ billingContext })) return;

	if (!(await isReceivableForPendingPlan({ ctx, metadata, stripeInvoice }))) {
		return;
	}

	ctx.logger.info(
		`[invoice.finalized] Enabling pending plan for metadata ${metadata.id}`,
	);
	await executeClaimedDeferredBillingPlan({ ctx, metadata, stripeInvoice });
};

/** Only the invoice the pending plan points at activates it; a parked reissued original never does. */
const isReceivableForPendingPlan = async ({
	ctx,
	metadata,
	stripeInvoice,
}: {
	ctx: StripeWebhookContext;
	metadata: Metadata;
	stripeInvoice: Stripe.Invoice;
}): Promise<boolean> => {
	if (metadata.stripe_invoice_id === stripeInvoice.id) return true;

	const replacesPendingInvoice =
		stripeInvoice.metadata?.autumn_reissued_from === metadata.stripe_invoice_id;
	if (!replacesPendingInvoice) return false;

	// Reissue finalizes the replacement before repointing the plan; retry once it has moved.
	const current = await ctx.stripeCli.invoices.retrieve(stripeInvoice.id);
	if (current.status === "void") return false;

	throw new InternalError({
		message: `Pending plan ${metadata.id} has not moved to reissued invoice ${stripeInvoice.id} yet`,
	});
};

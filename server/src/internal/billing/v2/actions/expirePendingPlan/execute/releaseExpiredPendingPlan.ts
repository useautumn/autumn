import type { Metadata } from "@autumn/shared";
import type Stripe from "stripe";
import type { RepoContext } from "@/db/repoContext";
import { MetadataService } from "@/internal/metadata/MetadataService";
import { cancelCreatedStripeSubscription } from "./cancelCreatedStripeSubscription";

/** Metadata is deleted last: if the cancel throws, it survives for the cron to retry. */
export const releaseExpiredPendingPlan = async ({
	ctx,
	stripeCli,
	metadata,
	stripeInvoice,
}: {
	ctx: RepoContext;
	stripeCli: Stripe;
	metadata: Metadata;
	stripeInvoice: Stripe.Invoice;
}) => {
	await cancelCreatedStripeSubscription({
		ctx,
		stripeCli,
		metadata,
		stripeInvoice,
	});
	await MetadataService.delete({ db: ctx.db, id: metadata.id });
};

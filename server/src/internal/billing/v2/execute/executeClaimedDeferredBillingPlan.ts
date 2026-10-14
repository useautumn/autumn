import type { DeferredAutumnBillingPlanData, Metadata } from "@autumn/shared";
import type Stripe from "stripe";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { executeDeferredBillingPlan } from "@/internal/billing/v2/execute/executeDeferredBillingPlan";
import { withDeferredBillingPlanLock } from "@/internal/billing/v2/execute/withDeferredBillingPlanLock";
import { MetadataService } from "@/internal/metadata/MetadataService";

export const executeClaimedDeferredBillingPlan = async ({
	ctx,
	metadata,
	stripeSubscription,
	stripeInvoice,
}: {
	ctx: AutumnContext;
	metadata: Metadata;
	stripeSubscription?: Stripe.Subscription;
	stripeInvoice?: Stripe.Invoice;
}): Promise<boolean> => {
	const data = metadata.data as DeferredAutumnBillingPlanData;
	if (data.orgId !== ctx.org.id || data.env !== ctx.env) return false;

	return withDeferredBillingPlanLock({
		orgId: ctx.org.id,
		env: ctx.env,
		metadataId: metadata.id,
		fn: async () => {
			const current = await MetadataService.get({
				db: ctx.db,
				id: metadata.id,
			});
			if (!current) {
				ctx.logger.info(
					`[deferred-invoice] Metadata ${metadata.id} already handled, skipping`,
				);
				return false;
			}

			await executeDeferredBillingPlan({
				ctx,
				metadata: current,
				stripeSubscription,
				stripeInvoice,
			});
			return true;
		},
	});
};

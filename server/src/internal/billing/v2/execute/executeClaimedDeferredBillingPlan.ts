import {
	type DeferredAutumnBillingPlanData,
	type Metadata,
	MetadataType,
} from "@autumn/shared";
import type Stripe from "stripe";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { executeDeferredBillingPlan } from "@/internal/billing/v2/execute/executeDeferredBillingPlan";
import { MetadataService } from "@/internal/metadata/MetadataService";

/** invoice.finalized and invoice.paid can race on the same deferred plan; only the claimant executes it. */
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

	const claimed = await MetadataService.claim({
		db: ctx.db,
		id: metadata.id,
		fromType: MetadataType.DeferredInvoice,
		toType: MetadataType.DeferredInvoiceProcessing,
	});
	if (!claimed) {
		ctx.logger.info(
			`[deferred-invoice] Metadata ${metadata.id} already executed or in flight, skipping`,
		);
		return false;
	}

	try {
		await executeDeferredBillingPlan({
			ctx,
			metadata,
			stripeSubscription,
			stripeInvoice,
		});
	} catch (error) {
		await MetadataService.claim({
			db: ctx.db,
			id: metadata.id,
			fromType: MetadataType.DeferredInvoiceProcessing,
			toType: MetadataType.DeferredInvoice,
		}).catch((revertError) => {
			ctx.logger.error(
				`[deferred-invoice] Failed to revert metadata claim for ${metadata.id}`,
				{ revertError },
			);
		});
		throw error;
	}

	return true;
};

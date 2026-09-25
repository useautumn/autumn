import {
	type DeferredAutumnBillingPlanData,
	type Metadata,
	MetadataType,
} from "@autumn/shared";
import type Stripe from "stripe";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { executeDeferredBillingPlan } from "@/internal/billing/v2/execute/executeDeferredBillingPlan";
import { MetadataService } from "@/internal/metadata/MetadataService";

const setDeferredInvoiceType = ({
	ctx,
	metadataId,
	fromType,
	toType,
}: {
	ctx: AutumnContext;
	metadataId: string;
	fromType: MetadataType;
	toType: MetadataType;
}) => MetadataService.claim({ db: ctx.db, id: metadataId, fromType, toType });

/** invoice.finalized and invoice.paid can both resume the same plan; only the claimer executes it. */
export const executeClaimedDeferredInvoicePlan = async ({
	ctx,
	metadata,
	stripeInvoice,
	stripeSubscription,
}: {
	ctx: AutumnContext;
	metadata: Metadata;
	stripeInvoice?: Stripe.Invoice;
	stripeSubscription?: Stripe.Subscription;
}) => {
	const data = metadata.data as DeferredAutumnBillingPlanData;
	if (data.orgId !== ctx.org.id || data.env !== ctx.env) return;

	const claimed = await setDeferredInvoiceType({
		ctx,
		metadataId: metadata.id,
		fromType: MetadataType.DeferredInvoice,
		toType: MetadataType.DeferredInvoiceProcessing,
	});

	if (!claimed) {
		ctx.logger.info(
			`[executeClaimedDeferredInvoicePlan] Metadata ${metadata.id} already claimed, skipping`,
		);
		return;
	}

	try {
		await executeDeferredBillingPlan({
			ctx,
			metadata,
			stripeSubscription,
			stripeInvoice,
		});
	} catch (error) {
		await setDeferredInvoiceType({
			ctx,
			metadataId: metadata.id,
			fromType: MetadataType.DeferredInvoiceProcessing,
			toType: MetadataType.DeferredInvoice,
		}).catch((revertError) => {
			ctx.logger.error(
				`[executeClaimedDeferredInvoicePlan] Failed to release claim on ${metadata.id}`,
				{ revertError },
			);
		});
		throw error;
	}
};

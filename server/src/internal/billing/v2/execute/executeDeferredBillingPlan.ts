import type { DeferredAutumnBillingPlanData, Metadata } from "@autumn/shared";
import type Stripe from "stripe";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { addStripeSubscriptionIdToBillingPlan } from "@/internal/billing/v2/execute/addStripeSubscriptionIdToBillingPlan";
import { executeAutumnBillingPlan } from "@/internal/billing/v2/execute/executeAutumnBillingPlan";
import { executeStripeBillingPlan } from "@/internal/billing/v2/providers/stripe/execute/executeStripeBillingPlan";
import { MetadataService } from "@/internal/metadata/MetadataService";
import { addToExtraLogs } from "@/utils/logging/addToExtraLogs";

export const executeDeferredBillingPlan = async ({
	ctx,
	metadata,
	stripeSubscription,
	stripeInvoice,
}: {
	ctx: AutumnContext;
	metadata: Metadata;
	stripeSubscription?: Stripe.Subscription;
	stripeInvoice?: Stripe.Invoice;
}) => {
	const { db } = ctx;
	const data = metadata.data as DeferredAutumnBillingPlanData;

	if (data.orgId !== ctx.org.id || data.env !== ctx.env) return;

	const { billingPlan, billingContext, resumeAfter } = data;

	addToExtraLogs({
		ctx,
		extras: {
			originalRequestId: data.requestId,
		},
	});

	// Execute stripe billing plan (resume from where we left off)
	const stripeBillingResult = await executeStripeBillingPlan({
		ctx,
		billingPlan,
		billingContext,
		resumeAfter,
	});

	if (stripeSubscription) {
		addStripeSubscriptionIdToBillingPlan({
			autumnBillingPlan: billingPlan.autumn,
			stripeSubscriptionId: stripeSubscription?.id,
		});
	}

	await executeAutumnBillingPlan({
		ctx,
		autumnBillingPlan: billingPlan.autumn,
		stripeInvoice: stripeBillingResult.stripeInvoice ?? stripeInvoice,
		stripeInvoiceItems: stripeBillingResult.stripeInvoiceItems,
		autumnInvoice: stripeBillingResult.autumnInvoice,
	});

	await MetadataService.delete({ db, id: metadata.id });
};

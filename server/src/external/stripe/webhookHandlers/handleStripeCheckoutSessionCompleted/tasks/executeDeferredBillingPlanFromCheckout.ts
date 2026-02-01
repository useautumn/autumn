import type { DeferredAutumnBillingPlanData, Metadata } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { executeAutumnBillingPlan } from "@/internal/billing/v2/execute/executeAutumnBillingPlan";
import { addToExtraLogs } from "@/utils/logging/addToExtraLogs";

/**
 * Executes a deferred billing plan from checkout session completed.
 * Similar to executeDeferredBillingPlan but takes pre-modified billing plan data.
 *
 * For checkout flow:
 * - Stripe subscription is already created by Stripe Checkout
 * - We skip subscription creation in executeStripeBillingPlan (no resumeAfter needed)
 * - We execute the autumn billing plan (which now includes upsertSubscription/upsertInvoice)
 * - We delete the metadata
 */
export const executeDeferredBillingPlanFromCheckout = async ({
	ctx,
	metadata,
	deferredData,
}: {
	ctx: AutumnContext;
	metadata: Metadata;
	deferredData: DeferredAutumnBillingPlanData;
}) => {
	const { db } = ctx;

	const { billingPlan, billingContext } = deferredData;

	addToExtraLogs({
		ctx,
		extras: {
			originalRequestId: deferredData.requestId,
		},
	});

	// // For checkout flow, Stripe subscription is already created by Stripe Checkout.
	// // We don't need to execute subscription actions - just execute any remaining
	// // stripe billing plan actions (invoice items, etc.) if needed.
	// // Pass undefined for resumeAfter since checkout doesn't use deferred invoice flow.
	// await executeStripeBillingPlan({
	// 	ctx,
	// 	billingPlan,
	// 	billingContext,
	// 	resumeAfter: undefined,
	// });

	// Execute autumn billing plan (includes customer products, upsertSubscription, upsertInvoice)
	await executeAutumnBillingPlan({
		ctx,
		autumnBillingPlan: billingPlan.autumn,
	});

	ctx.logger.info(
		"[checkout.completed] Successfully executed deferred billing plan",
	);
};

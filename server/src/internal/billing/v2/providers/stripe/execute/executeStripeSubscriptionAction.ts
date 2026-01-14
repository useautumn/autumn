import { ms } from "@autumn/shared";
import { createStripeCli } from "@/external/connect/createStripeCli";
import { logStripeInvoice } from "@/external/stripe/invoices/utils/logStripeInvoice";
import { isStripeSubscriptionCanceled } from "@/external/stripe/subscriptions/utils/classifyStripeSubscriptionUtils";
import { setStripeSubscriptionLock } from "@/external/stripe/subscriptions/utils/lockStripeSubscriptionUtils";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import type { BillingContext } from "@/internal/billing/v2/billingContext";
import { addStripeSubscriptionIdToBillingPlan } from "@/internal/billing/v2/execute/addStripeSubscriptionIdToBillingPlan";
import { removeStripeSubscriptionIdFromBillingPlan } from "@/internal/billing/v2/execute/removeStripeSubscriptionIdFromBillingPlan";
import { finalizeStripeInvoice } from "@/internal/billing/v2/providers/stripe/utils/invoices/stripeInvoiceOps";
import { executeStripeSubscriptionOperation } from "@/internal/billing/v2/providers/stripe/utils/subscriptions/executeStripeSubscriptionOperation";
import { getLatestInvoiceFromSubscriptionAction } from "@/internal/billing/v2/providers/stripe/utils/subscriptions/getLatestInvoiceFromSubscriptionAction";
import { StripeBillingStage } from "@/internal/billing/v2/types/autumnBillingPlan";
import type { BillingPlan } from "@/internal/billing/v2/types/billingPlan";
import type { StripeBillingPlanResult } from "@/internal/billing/v2/types/billingResult";
import { upsertInvoiceFromBilling } from "@/internal/billing/v2/utils/upsertFromStripe/upsertInvoiceFromBilling";
import { upsertSubscriptionFromBilling } from "@/internal/billing/v2/utils/upsertFromStripe/upsertSubscriptionFromBilling";
import { insertMetadataFromBillingPlan } from "@/internal/metadata/utils/insertMetadataFromBillingPlan";

export const executeStripeSubscriptionAction = async ({
	ctx,
	billingPlan,
	billingContext,
}: {
	ctx: AutumnContext;
	billingPlan: BillingPlan;
	billingContext: BillingContext;
}): Promise<StripeBillingPlanResult> => {
	// 1. Perform stripe subscription operation
	const { subscriptionAction } = billingPlan.stripe;

	if (!subscriptionAction) return {};

	let { invoiceMode, stripeSubscription, currentEpochMs } = billingContext;
	const { logger } = ctx;

	// 2. Lock stripe subscription
	if (stripeSubscription) {
		await setStripeSubscriptionLock({
			stripeSubscriptionId: stripeSubscription.id,
			lockedAtMs: currentEpochMs,
		});
	}

	logger.debug(`[execSubAction] Executing subscription operation`);
	stripeSubscription = await executeStripeSubscriptionOperation({
		ctx,
		billingContext,
		subscriptionAction,
	});

	let latestStripeInvoice = getLatestInvoiceFromSubscriptionAction({
		stripeSubscription,
		subscriptionAction,
		billingContext,
	});

	if (latestStripeInvoice && invoiceMode?.finalizeInvoice) {
		logger.debug(`[execSubAction] Finalizing invoice`);
		latestStripeInvoice = await finalizeStripeInvoice({
			stripeCli: createStripeCli({ org: ctx.org, env: ctx.env }),
			invoiceId: latestStripeInvoice.id,
		});

		logStripeInvoice({
			logger,
			stripeInvoice: latestStripeInvoice,
		});
	}

	const deferBillingPlan = latestStripeInvoice?.status === "open";

	if (latestStripeInvoice) {
		logger.debug(`[execSubAction] Upserting invoice from billing`);
		await upsertInvoiceFromBilling({
			ctx,
			stripeInvoice: latestStripeInvoice,
			fullProducts: billingContext.fullProducts,
			fullCustomer: billingContext.fullCustomer,
		});
	}

	if (deferBillingPlan) {
		if (!latestStripeInvoice) {
			logger.error(
				"Attempted to defer billing plan with no latest stripe invoice",
			);
		}

		logger.debug(`[execSubAction] Inserting metadata from billing plan`);

		// Required if we resume after and carry out subscription schedule action
		const deferredBillingContext = {
			...billingContext,
			stripeSubscription,
		};

		await insertMetadataFromBillingPlan({
			ctx,
			billingPlan,
			billingContext: deferredBillingContext,
			stripeInvoice: latestStripeInvoice,
			expiresAt: Date.now() + ms.days(30),
			resumeAfter: StripeBillingStage.SubscriptionAction,
		});

		return {
			stripeInvoice: latestStripeInvoice,
			stripeSubscription,
			deferred: true,
		};
	}

	addStripeSubscriptionIdToBillingPlan({
		autumnBillingPlan: billingPlan.autumn,
		stripeSubscriptionId: stripeSubscription.id,
	});

	// Add subscription to DB
	logger.debug(`[execSubAction] Upserting subscription from billing`);
	await upsertSubscriptionFromBilling({
		ctx,
		stripeSubscription,
	});

	// If the stripe subscription is canceled, remove the subscription from the billing plan
	if (isStripeSubscriptionCanceled(stripeSubscription)) {
		logger.debug(`[execSubAction] removing subscription from billing plan`);
		removeStripeSubscriptionIdFromBillingPlan({
			autumnBillingPlan: billingPlan.autumn,
			stripeSubscriptionId: stripeSubscription.id,
		});

		stripeSubscription = undefined;
	}

	return {
		stripeSubscription,
		stripeInvoice: latestStripeInvoice,
	};
};

import type {
	BillingContext,
	BillingPlan,
	BillingResult,
	StripeBillingPlanResult,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { checkoutSessionLock } from "@/internal/billing/v2/actions/locks/checkoutSessionLock/checkoutSessionLock";
import { executeAutumnBillingPlan } from "@/internal/billing/v2/execute/executeAutumnBillingPlan";
import { executeStripeBillingPlan } from "@/internal/billing/v2/providers/stripe/execute/executeStripeBillingPlan";
import { sendBillingUpdatedWebhook } from "@/internal/billing/v2/workflows/sendBillingUpdatedWebhook/sendBillingUpdatedWebhook";
import { billingPlanToSendProductsUpdated } from "@/internal/billing/v2/workflows/sendProductsUpdated/billingPlanToSendProductsUpdated";
import { workflows } from "@/queue/workflows";

export const executeBillingPlan = async ({
	ctx,
	billingContext,
	billingPlan,
	checkoutLockParamsHash,
}: {
	ctx: AutumnContext;
	billingContext: BillingContext;
	billingPlan: BillingPlan;
	checkoutLockParamsHash?: string;
}): Promise<BillingResult> => {
	const stripeBillingResult: StripeBillingPlanResult =
		billingContext.skipBillingChanges
			? {}
			: await executeStripeBillingPlan({
					ctx,
					billingPlan,
					billingContext,
				});

	if (stripeBillingResult.deferred) {
		// Store line items even when deferred — invoice already exists in DB
		if (
			stripeBillingResult.autumnInvoice &&
			stripeBillingResult.stripeInvoice
		) {
			await workflows.triggerStoreInvoiceLineItems({
				orgId: ctx.org.id,
				env: ctx.env,
				stripeInvoiceId: stripeBillingResult.stripeInvoice.id,
				autumnInvoiceId: stripeBillingResult.autumnInvoice.id,
				billingLineItems: billingPlan.autumn.lineItems,
			});
		}

		if (checkoutLockParamsHash && stripeBillingResult.stripeCheckoutSession) {
			await checkoutSessionLock.set({
				ctx,
				customerId:
					billingContext.fullCustomer.id ??
					billingContext.fullCustomer.internal_id,
				data: {
					paramsHash: checkoutLockParamsHash,
					checkoutSessionUrl:
						stripeBillingResult.stripeCheckoutSession.url ?? "",
					checkoutSessionId: stripeBillingResult.stripeCheckoutSession.id ?? "",
					expiresAt:
						"expires_at" in stripeBillingResult.stripeCheckoutSession
							? stripeBillingResult.stripeCheckoutSession.expires_at * 1000
							: undefined,
				},
			});
		}

		return {
			stripe: stripeBillingResult,
		};
	}

	await executeAutumnBillingPlan({
		ctx,
		autumnBillingPlan: billingPlan.autumn,
		stripeInvoice: stripeBillingResult.stripeInvoice,
		stripeInvoiceItems: stripeBillingResult.stripeInvoiceItems,
		autumnInvoice: stripeBillingResult.autumnInvoice,
	});

	// Queue webhooks after Autumn billing plan is executed
	await billingPlanToSendProductsUpdated({
		ctx,
		autumnBillingPlan: billingPlan.autumn,
		billingContext,
	});

	// Fire-and-forget: don't block the action on svix delivery
	void sendBillingUpdatedWebhook({
		ctx,
		autumnBillingPlan: billingPlan.autumn,
		originalFullCustomer: billingContext.fullCustomer,
	});

	return { stripe: stripeBillingResult };
};

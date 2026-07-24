import type {
	BillingContext,
	BillingPlan,
	BillingResult,
	StripeBillingPlanResult,
} from "@autumn/shared";
import type { DrizzleCli } from "@/db/initDrizzle";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { checkoutSessionLock } from "@/internal/billing/v2/actions/locks/checkoutSessionLock/checkoutSessionLock";
import { executeAutumnBillingPlan } from "@/internal/billing/v2/execute/executeAutumnBillingPlan";
import { executeStripeBillingPlan } from "@/internal/billing/v2/providers/stripe/execute/executeStripeBillingPlan";
import { discardStripeCheckoutSession } from "@/internal/billing/v2/providers/stripe/utils/checkoutSessions/discardStripeCheckoutSession";
import { sendBillingUpdatedWebhook } from "@/internal/billing/v2/workflows/sendBillingUpdatedWebhook/sendBillingUpdatedWebhook";
import { billingPlanToSendProductsUpdated } from "@/internal/billing/v2/workflows/sendProductsUpdated/billingPlanToSendProductsUpdated";
import { workflows } from "@/queue/workflows";

export const executeBillingPlan = async ({
	ctx,
	billingContext,
	billingPlan,
	checkoutLockParamsHash,
	onAutumnCommit,
}: {
	ctx: AutumnContext;
	billingContext: BillingContext;
	billingPlan: BillingPlan;
	checkoutLockParamsHash?: string;
	onAutumnCommit?: ({
		ctx,
		stripeBillingResult,
	}: {
		ctx: AutumnContext;
		stripeBillingResult: StripeBillingPlanResult;
	}) => Promise<void>;
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

	const executeAutumn = async (autumnCtx: AutumnContext) => {
		await executeAutumnBillingPlan({
			ctx: autumnCtx,
			autumnBillingPlan: billingPlan.autumn,
			stripeInvoice: stripeBillingResult.stripeInvoice,
			stripeInvoiceItems: stripeBillingResult.stripeInvoiceItems,
			autumnInvoice: stripeBillingResult.autumnInvoice,
		});
		await onAutumnCommit?.({
			ctx: autumnCtx,
			stripeBillingResult,
		});
	};

	try {
		if (onAutumnCommit) {
			await ctx.db.transaction(async (tx) => {
				await executeAutumn({
					...ctx,
					db: tx as unknown as DrizzleCli,
				});
			});
		} else {
			await executeAutumn(ctx);
		}
	} catch (error) {
		if (onAutumnCommit && stripeBillingResult.stripeCheckoutSession) {
			await discardStripeCheckoutSession({
				ctx,
				session: stripeBillingResult.stripeCheckoutSession,
			}).catch((cleanupError) => {
				ctx.logger.error(
					`Failed to discard checkout session after rollback: ${cleanupError}`,
				);
			});
		}
		throw error;
	}

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

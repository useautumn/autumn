import type {
	BillingContext,
	BillingPlan,
	StripeBillingPlanResult,
} from "@autumn/shared";
import { invoices, StripeBillingStage } from "@autumn/shared";
import { eq } from "drizzle-orm";
import type Stripe from "stripe";
import { createStripeCli } from "@/external/connect/createStripeCli";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { addStripeSubscriptionScheduleIdToBillingPlan } from "@/internal/billing/v2/execute/addStripeSubscriptionScheduleIdToBillingPlan";
import { executeStripeCheckoutSessionAction } from "@/internal/billing/v2/providers/stripe/execute/executeStripeCheckoutSessionAction";
import { executeStripeInvoiceAction } from "@/internal/billing/v2/providers/stripe/execute/executeStripeInvoiceAction";
import { executeStripeRefundAction } from "@/internal/billing/v2/providers/stripe/execute/executeStripeRefundAction.js";
import { executeStripeSubscriptionAction } from "@/internal/billing/v2/providers/stripe/execute/executeStripeSubscriptionAction";
import { executeStripeSubscriptionScheduleAction } from "@/internal/billing/v2/providers/stripe/execute/executeStripeSubscriptionScheduleAction";
import { createStripeInvoiceItems } from "@/internal/billing/v2/providers/stripe/utils/invoices/stripeInvoiceOps";
import {
	createRefundAndUpdateInvoice,
	resolveChargeFromInvoice,
} from "@/internal/customers/handlers/handleRefundInvoice/invoiceRefundUtils";
import { deleteCachedFullCustomer } from "@/internal/customers/cusUtils/fullCustomerCacheUtils/deleteCachedFullCustomer";
import { invoiceActions } from "@/internal/invoices/actions";
import { upsertInvoiceInCache } from "@/internal/invoices/actions/cache/upsertInvoiceInCache";
import { InvoiceService } from "@/internal/invoices/InvoiceService";

const rollbackInvoiceItems = async ({
	ctx,
	stripeInvoiceItems,
}: {
	ctx: AutumnContext;
	stripeInvoiceItems?: Stripe.InvoiceItem[];
}) => {
	if (!stripeInvoiceItems?.length) return;

	const stripeCli = createStripeCli({ org: ctx.org, env: ctx.env });
	const results = await Promise.allSettled(
		stripeInvoiceItems.map((item) => stripeCli.invoiceItems.del(item.id)),
	);
	const failedResults = results.filter(
		(result): result is PromiseRejectedResult => result.status === "rejected",
	);
	if (failedResults.length) {
		throw new AggregateError(
			failedResults.map((result) => result.reason),
			`[executeStripeBillingPlan] Failed to delete ${failedResults.length}/${stripeInvoiceItems.length} invoice item(s) after later Stripe action failed`,
		);
	}
	ctx.logger.info(
		`[executeStripeBillingPlan] Deleted ${stripeInvoiceItems.length} invoice item(s) after later Stripe action failed`,
	);
};

const rollbackInvoiceAction = async ({
	ctx,
	billingContext,
	invoiceResult,
}: {
	ctx: AutumnContext;
	billingContext: BillingContext;
	invoiceResult?: StripeBillingPlanResult;
}) => {
	const stripeInvoice = invoiceResult?.stripeInvoice;
	if (!stripeInvoice) return;

	const stripeCli = createStripeCli({ org: ctx.org, env: ctx.env });
	const customerId = billingContext.fullCustomer.id ?? "";

	if (stripeInvoice.status === "draft") {
		await stripeCli.invoices.del(stripeInvoice.id);
		await ctx.db
			.delete(invoices)
			.where(eq(invoices.stripe_id, stripeInvoice.id));
		await deleteCachedFullCustomer({
			ctx,
			customerId,
			source: "executeStripeBillingPlan.rollbackInvoiceAction",
		});
		ctx.logger.info(
			`[executeStripeBillingPlan] Deleted draft invoice ${stripeInvoice.id} after later Stripe action failed`,
		);
		return;
	}

	if (
		stripeInvoice.status === "open" ||
		stripeInvoice.status === "uncollectible"
	) {
		const voidedInvoice = await stripeCli.invoices.voidInvoice(stripeInvoice.id);
		await invoiceActions.updateFromStripe({
			ctx,
			customerId,
			stripeInvoice: voidedInvoice,
		});
		ctx.logger.info(
			`[executeStripeBillingPlan] Voided invoice ${stripeInvoice.id} after later Stripe action failed`,
		);
		return;
	}

	if (stripeInvoice.status !== "paid") return;

	const expandedInvoice = await stripeCli.invoices.retrieve(stripeInvoice.id, {
		expand: ["payments.data.payment.payment_intent"],
	});
	const charge = await resolveChargeFromInvoice({
		stripeCli,
		stripeInvoice: expandedInvoice,
	});
	const refundableAmountInCents = charge
		? charge.amount - charge.amount_refunded
		: 0;

	if (!charge || refundableAmountInCents <= 0) return;

	await createRefundAndUpdateInvoice({
		stripeCli,
		db: ctx.db,
		chargeId: charge.id,
		stripeInvoiceId: stripeInvoice.id,
		amountInCents: refundableAmountInCents,
	});
	const updatedInvoice = await InvoiceService.getByStripeId({
		db: ctx.db,
		stripeId: stripeInvoice.id,
	});
	if (updatedInvoice) {
		await upsertInvoiceInCache({
			ctx,
			customerId,
			invoice: updatedInvoice,
		});
	}
	ctx.logger.info(
		`[executeStripeBillingPlan] Refunded invoice ${stripeInvoice.id} after later Stripe action failed`,
	);
};

const rollbackAfterSubscriptionFailure = async ({
	ctx,
	billingContext,
	invoiceResult,
	stripeInvoiceItems,
}: {
	ctx: AutumnContext;
	billingContext: BillingContext;
	invoiceResult?: StripeBillingPlanResult;
	stripeInvoiceItems?: Stripe.InvoiceItem[];
}) => {
	const rollbackErrors: unknown[] = [];
	const runRollbackStep = async (
		message: string,
		rollback: () => Promise<void>,
	) => {
		try {
			await rollback();
		} catch (error) {
			ctx.logger.error(message, { error });
			rollbackErrors.push(error);
		}
	};

	await runRollbackStep(
		"[executeStripeBillingPlan] Failed to roll back invoice items after subscription action failed",
		() => rollbackInvoiceItems({ ctx, stripeInvoiceItems }),
	);
	await runRollbackStep(
		"[executeStripeBillingPlan] Failed to roll back invoice after subscription action failed",
		() => rollbackInvoiceAction({ ctx, billingContext, invoiceResult }),
	);

	if (!rollbackErrors.length) return;

	return new AggregateError(
		rollbackErrors,
		"[executeStripeBillingPlan] Failed to roll back Stripe side effects after subscription action failed",
	);
};

export const executeStripeBillingPlan = async ({
	ctx,
	billingPlan,
	billingContext,
	resumeAfter,
}: {
	ctx: AutumnContext;
	billingPlan: BillingPlan;
	billingContext: BillingContext;
	resumeAfter?: StripeBillingStage;
}): Promise<StripeBillingPlanResult> => {
	const {
		subscriptionAction: stripeSubscriptionAction,
		invoiceAction: stripeInvoiceAction,
		invoiceItemsAction: stripeInvoiceItemsAction,
		subscriptionScheduleAction: stripeSubscriptionScheduleAction,
		checkoutSessionAction: stripeCheckoutSessionAction,
	} = billingPlan.stripe;

	// Execute checkout session FIRST if present (returns early with deferred result)
	if (stripeCheckoutSessionAction) {
		return executeStripeCheckoutSessionAction({
			ctx,
			billingPlan,
			billingContext,
			checkoutSessionAction: stripeCheckoutSessionAction,
		});
	}

	// Collect results from each stage
	let invoiceResult: StripeBillingPlanResult | undefined;
	let subscriptionResult: StripeBillingPlanResult | undefined;
	let stripeSubscription = billingContext.stripeSubscription;

	const resumeAfterInvoiceAction =
		resumeAfter === StripeBillingStage.InvoiceAction;

	const resumeAfterSubscriptionAction =
		resumeAfter === StripeBillingStage.SubscriptionAction;

	if (stripeInvoiceAction && !resumeAfterInvoiceAction) {
		invoiceResult = await executeStripeInvoiceAction({
			ctx,
			billingPlan,
			billingContext,
		});

		if (invoiceResult.deferred) return invoiceResult;
	}

	let stripeInvoiceItems: Stripe.InvoiceItem[] | undefined;
	if (
		stripeInvoiceItemsAction?.createInvoiceItems &&
		!resumeAfterSubscriptionAction
	) {
		stripeInvoiceItems = await createStripeInvoiceItems({
			ctx,
			invoiceItems: stripeInvoiceItemsAction.createInvoiceItems,
		});
	}

	// For schedule release, we need to release first before updating subscription with cancel_at
	// Otherwise Stripe rejects the cancel_at update while schedule still manages subscription
	const isReleaseAction = stripeSubscriptionScheduleAction?.type === "release";

	if (isReleaseAction && !resumeAfterSubscriptionAction) {
		await executeStripeSubscriptionScheduleAction({
			ctx,
			billingContext,
			subscriptionScheduleAction: stripeSubscriptionScheduleAction,
			stripeSubscription,
		});
	}

	if (stripeSubscriptionAction && !resumeAfterSubscriptionAction) {
		try {
			subscriptionResult = await executeStripeSubscriptionAction({
				ctx,
				billingPlan,
				billingContext,
			});
		} catch (error) {
			const rollbackError = await rollbackAfterSubscriptionFailure({
				ctx,
				billingContext,
				invoiceResult,
				stripeInvoiceItems,
			});
			if (rollbackError) {
				throw new AggregateError(
					[error, rollbackError],
					"[executeStripeBillingPlan] Subscription action failed and rollback was incomplete",
				);
			}
			throw error;
		}
		if (subscriptionResult?.deferred) return subscriptionResult;
		stripeSubscription =
			subscriptionResult.stripeSubscription ?? stripeSubscription;
	}

	if (stripeSubscriptionScheduleAction && !isReleaseAction) {
		const stripeSubscriptionSchedule =
			await executeStripeSubscriptionScheduleAction({
				ctx,
				billingContext,
				subscriptionScheduleAction: stripeSubscriptionScheduleAction,
				stripeSubscription,
			});

		if (stripeSubscriptionSchedule) {
			addStripeSubscriptionScheduleIdToBillingPlan({
				autumnBillingPlan: billingPlan.autumn,
				stripeBillingPlan: billingPlan.stripe,
				stripeSubscriptionScheduleId: stripeSubscriptionSchedule.id,
			});
		}
	}

	// Execute refund action (after subscription cancel)

	let stripeRefund: Stripe.Refund | undefined;
	if (billingPlan.stripe.refundAction) {
		try {
			stripeRefund = await executeStripeRefundAction({
				ctx,
				refundAction: billingPlan.stripe.refundAction,
			});
		} catch (error) {
			ctx.logger.error(
				"[executeStripeBillingPlan] Refund failed after subscription cancel",
				{ error },
			);
		}
	}

	const stripeInvoice =
		subscriptionResult?.stripeInvoice ?? invoiceResult?.stripeInvoice;

	const autumnInvoice =
		subscriptionResult?.autumnInvoice ?? invoiceResult?.autumnInvoice;

	return {
		stripeSubscription: subscriptionResult?.stripeSubscription,
		stripeInvoice,
		stripeInvoiceItems,
		stripeRefund,
		requiredAction:
			subscriptionResult?.requiredAction ?? invoiceResult?.requiredAction,
		autumnInvoice,
	};
};

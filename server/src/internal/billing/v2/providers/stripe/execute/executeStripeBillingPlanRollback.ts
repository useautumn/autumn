import type {
	BillingContext,
	StripeBillingPlanResult,
} from "@autumn/shared";
import { invoices } from "@autumn/shared";
import { eq } from "drizzle-orm";
import type Stripe from "stripe";
import { createStripeCli } from "@/external/connect/createStripeCli";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
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

	if (!charge) {
		throw new Error(
			`[executeStripeBillingPlan] Cannot roll back paid invoice ${stripeInvoice.id}: no refundable charge found`,
		);
	}

	const refundableAmountInCents = charge.amount - charge.amount_refunded;

	if (refundableAmountInCents <= 0) {
		throw new Error(
			`[executeStripeBillingPlan] Cannot roll back paid invoice ${stripeInvoice.id}: no refundable amount remaining on charge ${charge.id}`,
		);
	}

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

export const rollbackAfterSubscriptionFailure = async ({
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

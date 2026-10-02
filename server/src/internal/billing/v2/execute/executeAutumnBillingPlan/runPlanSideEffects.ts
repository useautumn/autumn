import type { AutumnBillingPlan, Invoice } from "@autumn/shared";
import type Stripe from "stripe";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { refreshAllocationScale } from "@/internal/balances/allocate/actions/refreshAllocationScale";
import {
	type PendingBatchTransition,
	startBatchTransitions,
} from "@/internal/billing/v2/execute/executeAutumnActions/executeCustomerLicenseTransitions";
import { invoiceActions } from "@/internal/invoices/actions";
import { reconcileLicenseStateForCustomer } from "@/internal/licenses/actions/reconcile/reconcileLicenseState";
import { SubService } from "@/internal/subscriptions/SubService";
import { workflows } from "@/queue/workflows";

/** Customer-only plans (links, profile fields, subscription upserts) leave the shared credits allocations divide alone. */
const planMayMoveSharedCredits = (plan: AutumnBillingPlan): boolean =>
	plan.insertCustomerProducts.length > 0 ||
	Boolean(plan.updateCustomerProduct) ||
	(plan.updateCustomerProducts?.length ?? 0) > 0 ||
	Boolean(plan.deleteCustomerProduct) ||
	(plan.deleteCustomerProducts?.length ?? 0) > 0 ||
	(plan.patchCustomerProducts?.length ?? 0) > 0 ||
	(plan.insertCustomerEntitlements?.length ?? 0) > 0 ||
	(plan.updateCustomerEntitlements?.length ?? 0) > 0 ||
	Boolean(plan.pooledBalancePlan) ||
	Boolean(plan.balanceTransitionPlan) ||
	Boolean(plan.autoTopupRebalance) ||
	Boolean(plan.oneOffPurchaseRebalance);

/** After the plan's rows commit: what reads them back or reaches past them (seat convergence, ledgers, workflows, reconcile). */
export const runPlanSideEffects = async ({
	ctx,
	autumnBillingPlan,
	pendingBatchTransitions,
	stripeInvoice,
	stripeInvoiceItems,
	autumnInvoice,
	emitsBillingUpdated,
}: {
	ctx: AutumnContext;
	autumnBillingPlan: AutumnBillingPlan;
	pendingBatchTransitions: PendingBatchTransition[];
	stripeInvoice?: Stripe.Invoice;
	stripeInvoiceItems?: Stripe.InvoiceItem[];
	autumnInvoice?: Invoice;
	emitsBillingUpdated: boolean;
}): Promise<{ allocationsAdjusted: boolean }> => {
	const { db } = ctx;

	await startBatchTransitions({ ctx, pending: pendingBatchTransitions });

	for (const subscription of autumnBillingPlan.upsertSubscriptions ?? []) {
		await SubService.upsertByStripeId({ db, subscription });
	}

	let invoice = autumnInvoice;
	if (!invoice && autumnBillingPlan.upsertInvoice) {
		invoice = await invoiceActions.upsertToDbAndCache({
			ctx,
			customerId: autumnBillingPlan.customerId,
			invoice: autumnBillingPlan.upsertInvoice,
		});
	}

	// Store invoice line items (async via SQS)
	if (invoice && stripeInvoice) {
		await workflows.triggerStoreInvoiceLineItems({
			orgId: ctx.org.id,
			env: ctx.env,
			stripeInvoiceId: stripeInvoice.id,
			autumnInvoiceId: invoice.id,
			billingLineItems: autumnBillingPlan.lineItems,
		});
	}

	// Store deferred line items (ProrateNextCycle pending items)
	// These are invoice items created without an invoice — stored with invoice_id = null
	if (
		stripeInvoiceItems &&
		stripeInvoiceItems.length > 0 &&
		autumnBillingPlan.lineItems
	) {
		await workflows.triggerStoreDeferredInvoiceLineItems({
			orgId: ctx.org.id,
			env: ctx.env,
			deferredStripeInvoiceItems: stripeInvoiceItems,
			billingLineItems: autumnBillingPlan.lineItems,
		});
	}

	const mayTouchLicenses =
		(autumnBillingPlan.customerLicenseUpdates?.length ?? 0) > 0 ||
		(autumnBillingPlan.insertPlanLicenses?.length ?? 0) > 0 ||
		(autumnBillingPlan.patchCustomerProducts?.some(
			(patch) => (patch.insertCustomerLicenses?.length ?? 0) > 0,
		) ??
			false) ||
		(autumnBillingPlan.insertCustomerProducts?.some(
			(customerProduct) => (customerProduct.customer_licenses?.length ?? 0) > 0,
		) ??
			false);

	if (mayTouchLicenses && autumnBillingPlan.customerId) {
		await reconcileLicenseStateForCustomer({
			ctx,
			idOrInternalId: autumnBillingPlan.customerId,
			deleteCache: true,
		});
	}

	if (
		!autumnBillingPlan.customerId ||
		!planMayMoveSharedCredits(autumnBillingPlan)
	)
		return { allocationsAdjusted: false };
	const { adjusted } = await refreshAllocationScale({
		ctx,
		customerId: autumnBillingPlan.customerId,
		notify: !emitsBillingUpdated,
	}).catch((error) => {
		ctx.logger.error("[refreshAllocationScale] failed", { error });
		return { adjusted: false };
	});
	return { allocationsAdjusted: emitsBillingUpdated && adjusted };
};

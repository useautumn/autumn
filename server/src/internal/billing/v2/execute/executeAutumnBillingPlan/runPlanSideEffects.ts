import type { AutumnBillingPlan, Invoice } from "@autumn/shared";
import type Stripe from "stripe";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import {
	type PendingBatchTransition,
	startBatchTransitions,
} from "@/internal/billing/v2/execute/executeAutumnActions/executeCustomerLicenseTransitions";
import { invoiceActions } from "@/internal/invoices/actions";
import { reconcileLicenseStateForCustomer } from "@/internal/licenses/actions/reconcile/reconcileLicenseState";
import { SubService } from "@/internal/subscriptions/SubService";
import { workflows } from "@/queue/workflows";

/** After the plan's rows commit: what reads them back or reaches past them (seat convergence, ledgers, workflows, reconcile). */
export const runPlanSideEffects = async ({
	ctx,
	autumnBillingPlan,
	pendingBatchTransitions,
	stripeInvoice,
	stripeInvoiceItems,
	autumnInvoice,
}: {
	ctx: AutumnContext;
	autumnBillingPlan: AutumnBillingPlan;
	pendingBatchTransitions: PendingBatchTransition[];
	stripeInvoice?: Stripe.Invoice;
	stripeInvoiceItems?: Stripe.InvoiceItem[];
	autumnInvoice?: Invoice;
}): Promise<void> => {
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
};

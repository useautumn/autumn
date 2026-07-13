import type { AutumnBillingPlan, Invoice } from "@autumn/shared";
import type Stripe from "stripe";
import type { DrizzleCli } from "@/db/initDrizzle";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { executeAutoTopupRebalance } from "@/internal/billing/v2/execute/executeAutumnActions/executeAutoTopupRebalance";
import { executePatchCustomerProducts } from "@/internal/billing/v2/execute/executeAutumnActions/executePatchCustomerProducts";
import { insertNewCusProducts } from "@/internal/billing/v2/execute/executeAutumnActions/insertNewCusProducts";
import { updateCustomerEntitlements } from "@/internal/billing/v2/execute/executeAutumnActions/updateCustomerEntitlements";
import {
	getDeleteCustomerProducts,
	getUpdateCustomerProducts,
} from "@/internal/billing/v2/utils/billingPlan/customerProductPlanMutations";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService";
import { CusEntService } from "@/internal/customers/cusProducts/cusEnts/CusEntitlementService";
import { replaceScheduledPhaseCustomerProductIds } from "@/internal/customers/schedules/repos/replaceScheduledPhaseCustomerProductIds";
import { invoiceActions } from "@/internal/invoices/actions";
import { EntitlementService } from "@/internal/products/entitlements/EntitlementService";
import { FreeTrialService } from "@/internal/products/free-trials/FreeTrialService";
import { PriceService } from "@/internal/products/prices/PriceService";
import { SubService } from "@/internal/subscriptions/SubService";
import { workflows } from "@/queue/workflows";

export const executeAutumnBillingPlan = async ({
	ctx,
	autumnBillingPlan,
	stripeInvoice,
	stripeInvoiceItems,
	autumnInvoice,
	withTransaction = false,
}: {
	ctx: AutumnContext;
	autumnBillingPlan: AutumnBillingPlan;
	stripeInvoice?: Stripe.Invoice;
	stripeInvoiceItems?: Stripe.InvoiceItem[];
	autumnInvoice?: Invoice;
	/** Wrap the DB mutations (steps 1-6) in a single transaction so concurrent
	 * writers can't observe or delete half-inserted customer product rows. */
	withTransaction?: boolean;
}) => {
	const {
		insertCustomerProducts,
		customPrices,
		customEntitlements,
		customFreeTrial,
		insertCustomerEntitlements,
	} = autumnBillingPlan;
	const updateCustomerProducts = getUpdateCustomerProducts({
		autumnBillingPlan,
	});
	const deleteCustomerProducts = getDeleteCustomerProducts({
		autumnBillingPlan,
	});

	const runDbMutations = async (execCtx: AutumnContext) => {
		const { db } = execCtx;

		if (customEntitlements) {
			await EntitlementService.insert({
				db,
				data: customEntitlements,
			});
		}

		if (customPrices) {
			await PriceService.insert({
				db,
				data: customPrices,
			});
		}

		if (customFreeTrial) {
			await FreeTrialService.insert({
				db,
				data: customFreeTrial,
			});
		}

		if (insertCustomerEntitlements) {
			await CusEntService.insert({
				ctx: execCtx,
				data: insertCustomerEntitlements,
			});
		}

		if (autumnBillingPlan.patchCustomerProducts) {
			// Custom prices/entitlements above must be inserted before customer rows can reference them.
			// Patch execution only inserts/deletes customer_prices and customer_entitlements.
			await executePatchCustomerProducts({
				ctx: execCtx,
				patchCustomerProducts: autumnBillingPlan.patchCustomerProducts,
			});
		}

		// 2. Insert new customer products
		await insertNewCusProducts({
			ctx: execCtx,
			newCusProducts: insertCustomerProducts,
		});

		await replaceScheduledPhaseCustomerProductIds({
			ctx: execCtx,
			replacements: autumnBillingPlan.schedulePhaseCustomerProductReplacements,
		});

		// 3. Update customer product (DB only)
		for (const { customerProduct, updates } of updateCustomerProducts) {
			// Skip empty updates — drizzle throws "No values to set" on empty SET.
			// This happens when the billing plan registers a customer product update
			// entry (e.g. for intent=None discount-only flows) but there are no
			// actual DB columns to change.
			if (!updates || Object.keys(updates).length === 0) continue;

			await CusProductService.update({
				ctx: execCtx,
				cusProductId: customerProduct.id,
				updates: updates,
			});
		}

		// 4. Delete scheduled customer product (e.g., when updating while canceling)
		for (const deleteCustomerProduct of deleteCustomerProducts) {
			execCtx.logger.debug(
				`[executeAutumnBillingPlan] deleting scheduled customer product: ${deleteCustomerProduct.product.id}`,
			);
			await CusProductService.delete({
				ctx: execCtx,
				cusProductId: deleteCustomerProduct.id,
			});
		}

		// 5. Update entitlement balances
		await updateCustomerEntitlements({
			ctx: execCtx,
			customerId: autumnBillingPlan.customerId,
			updates: autumnBillingPlan.updateCustomerEntitlements,
		});

		// 5a. Auto top-up rebalance: apply pre-computed paydown + remainder deltas as
		// atomic SQL `balance + delta` increments.
		if (autumnBillingPlan.autoTopupRebalance) {
			await executeAutoTopupRebalance({
				ctx: execCtx,
				customerId: autumnBillingPlan.customerId,
				deltas: autumnBillingPlan.autoTopupRebalance.deltas,
			});
		}

		// 6. Upsert subscription (if provided)
		if (autumnBillingPlan.upsertSubscription) {
			await SubService.upsertByStripeId({
				db,
				subscription: autumnBillingPlan.upsertSubscription,
			});
		}
	};

	if (withTransaction) {
		// initDrizzle normalizes transaction clients to the same execute contract as ctx.db.
		await ctx.db.transaction((tx) =>
			runDbMutations({ ...ctx, db: tx as unknown as DrizzleCli }),
		);
	} else {
		await runDbMutations(ctx);
	}

	// 7. Upsert invoice (if provided)
	if (!autumnInvoice && autumnBillingPlan.upsertInvoice) {
		autumnInvoice = await invoiceActions.upsertToDbAndCache({
			ctx,
			customerId: autumnBillingPlan.customerId,
			invoice: autumnBillingPlan.upsertInvoice,
		});
	}

	// 9. Trigger workflow to store invoice line items (async via SQS)
	if (autumnInvoice && stripeInvoice) {
		await workflows.triggerStoreInvoiceLineItems({
			orgId: ctx.org.id,
			env: ctx.env,
			stripeInvoiceId: stripeInvoice.id,
			autumnInvoiceId: autumnInvoice.id,
			billingLineItems: autumnBillingPlan.lineItems,
		});
	}

	// 10. Trigger workflow to store deferred line items (ProrateNextCycle pending items)
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
};

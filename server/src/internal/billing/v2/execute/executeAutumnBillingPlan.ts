import type { AutumnBillingPlan, Invoice } from "@autumn/shared";
import type Stripe from "stripe";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { insertNewCusProducts } from "@/internal/billing/v2/execute/executeAutumnActions/insertNewCusProducts";
import {
	getDeleteCustomerProducts,
	getUpdateCustomerProducts,
} from "@/internal/billing/v2/utils/billingPlan/customerProductPlanMutations";
import { updateCustomerEntitlements } from "@/internal/billing/v2/execute/executeAutumnActions/updateCustomerEntitlements";
import { customerProductActions } from "@/internal/customers/cusProducts/actions";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService";
import { CusEntService } from "@/internal/customers/cusProducts/cusEnts/CusEntitlementService";
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
}: {
	ctx: AutumnContext;
	autumnBillingPlan: AutumnBillingPlan;
	stripeInvoice?: Stripe.Invoice;
	stripeInvoiceItems?: Stripe.InvoiceItem[];
	autumnInvoice?: Invoice;
}) => {
	const { db } = ctx;
	const {
		insertCustomerProducts,
		customPrices,
		customEntitlements,
		customFreeTrial,
		insertCustomerEntitlements,
	} = autumnBillingPlan;
	const updateCustomerProducts = getUpdateCustomerProducts({ autumnBillingPlan });
	const deleteCustomerProducts = getDeleteCustomerProducts({ autumnBillingPlan });

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
			ctx,
			data: insertCustomerEntitlements,
		});
	}

	// ctx.logger.debug(
	// 	`[execAutumnPlan] inserting new customer products: ${insertCustomerProducts.map((cp) => cp.product.id).join(", ")}`,
	// );
	// 2. Insert new customer products
	await insertNewCusProducts({
		ctx,
		newCusProducts: insertCustomerProducts,
	});

	// 3. Update customer product (DB + cache)
	for (const { customerProduct, updates } of updateCustomerProducts) {
		await customerProductActions.updateDbAndCache({
			ctx,
			customerId: autumnBillingPlan.customerId,
			cusProductId: customerProduct.id,
			updates,
		});
	}

	// 4. Delete scheduled customer product (e.g., when updating while canceling)
	for (const deleteCustomerProduct of deleteCustomerProducts) {
		ctx.logger.debug(
			`[executeAutumnBillingPlan] deleting scheduled customer product: ${deleteCustomerProduct.product.id}`,
		);
		await CusProductService.delete({
			ctx,
			cusProductId: deleteCustomerProduct.id,
		});
	}

	// 5. Update entitlement balances
	await updateCustomerEntitlements({
		ctx,
		customerId: autumnBillingPlan.customerId,
		updates: autumnBillingPlan.updateCustomerEntitlements,
	});

	// 6. Upsert subscription (if provided)
	if (autumnBillingPlan.upsertSubscription) {
		await SubService.upsertByStripeId({
			db,
			subscription: autumnBillingPlan.upsertSubscription,
		});
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

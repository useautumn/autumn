import type {
	AutumnBillingPlan,
	InsertCustomerEntitlement,
	Invoice,
} from "@autumn/shared";
import type Stripe from "stripe";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { insertNewCusProducts } from "@/internal/billing/v2/execute/executeAutumnActions/insertNewCusProducts";
import { updateCustomerEntitlements } from "@/internal/billing/v2/execute/executeAutumnActions/updateCustomerEntitlements";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService";
import { CusEntService } from "@/internal/customers/cusProducts/cusEnts/CusEntitlementService";
import { InvoiceService } from "@/internal/invoices/InvoiceService";
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
		updateCustomerProduct,
		deleteCustomerProduct,
		customPrices,
		customEntitlements,
		customFreeTrial,
		insertCustomerEntitlements,
	} = autumnBillingPlan;

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
			data: insertCustomerEntitlements as InsertCustomerEntitlement[],
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

	// 3. Update customer product options
	if (updateCustomerProduct) {
		const { customerProduct, updates } = updateCustomerProduct;

		await CusProductService.update({
			ctx,
			cusProductId: customerProduct.id,
			updates,
		});
	}

	// 4. Delete scheduled customer product (e.g., when updating while canceling)
	if (deleteCustomerProduct) {
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
		autumnInvoice = await InvoiceService.upsert({
			db,
			invoice: autumnBillingPlan.upsertInvoice,
		});
	}

	// 8. Trigger workflow to store invoice line items (async via SQS)
	if (autumnInvoice && stripeInvoice) {
		await workflows.triggerStoreInvoiceLineItems({
			orgId: ctx.org.id,
			env: ctx.env,
			stripeInvoiceId: stripeInvoice.id,
			autumnInvoiceId: autumnInvoice.id,
			billingLineItems: autumnBillingPlan.lineItems,
		});
	}

	// 9. Trigger workflow to store deferred line items (ProrateNextCycle pending items)
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

import {
	BillingType,
	cusProductsToCusEnts,
	type FullCusEntWithFullCusProduct,
} from "@autumn/shared";
import { isStripeInvoiceForNewPeriod } from "@/external/stripe/invoices/utils/classifyStripeInvoice";
import { isStripeSubscriptionVercel } from "@/external/stripe/subscriptions/utils/classifyStripeSubscriptionUtils";
import type { InvoiceCreatedContext } from "@/external/stripe/webhookHandlers/handleStripeInvoiceCreated/setupInvoiceCreatedContext";
import type { StripeWebhookContext } from "@/external/stripe/webhookMiddlewares/stripeWebhookContext";
import { CusEntService } from "@/internal/customers/cusProducts/cusEnts/CusEntitlementService";
import { findLinkedCusEnts } from "@/internal/customers/cusProducts/cusEnts/cusEntUtils/findCusEntUtils";
import { removeReplaceablesFromCusEnt } from "@/internal/customers/cusProducts/cusEnts/cusEntUtils/linkedCusEntUtils";
import { RepService } from "@/internal/customers/cusProducts/cusEnts/RepService";
import { logAllocatedPriceProcessed } from "../logs/logInvoiceCreatedPriceProcessing";

/**
 * Handle reset balance?
 */

const processAllocatedPrice = async ({
	ctx,
	eventContext,
	customerEntitlement,
}: {
	ctx: StripeWebhookContext;
	eventContext: InvoiceCreatedContext;
	customerEntitlement: FullCusEntWithFullCusProduct;
}) => {
	const { db } = ctx;
	const { stripeInvoice, fullCustomer } = eventContext;

	const customerProduct = customerEntitlement.customer_product;
	const customerEntitlements = customerProduct?.customer_entitlements ?? [];

	const isNewPeriod = isStripeInvoiceForNewPeriod(stripeInvoice);
	if (!isNewPeriod) return;

	const feature = customerEntitlement.entitlement.feature;
	const replaceables = customerEntitlement.replaceables.filter(
		(r) => r.delete_next_cycle,
	);

	if (replaceables.length === 0) return false;

	const linkedCusEnts = findLinkedCusEnts({
		cusEnts: customerEntitlements,
		feature,
	});

	for (const linkedCusEnt of linkedCusEnts) {
		const { newEntities } = removeReplaceablesFromCusEnt({
			cusEnt: linkedCusEnt,
			replaceableIds: replaceables.map((r) => r.id),
		});

		await CusEntService.update({
			ctx,
			id: linkedCusEnt.id,
			updates: {
				entities: newEntities,
			},
		});
	}

	await CusEntService.increment({
		ctx,
		id: customerEntitlement.id,
		amount: replaceables.length,
	});

	await RepService.deleteInIds({
		ctx,
		ids: replaceables.map((r) => r.id),
	});

	logAllocatedPriceProcessed({
		ctx,
		customerEntitlement,
		replaceablesRemoved: replaceables.length,
		balanceIncremented: replaceables.length,
	});

	return true;
};

export const processAllocatedPricesForInvoiceCreated = async ({
	ctx,
	eventContext,
}: {
	ctx: StripeWebhookContext;
	eventContext: InvoiceCreatedContext;
}): Promise<void> => {
	const { stripeInvoice, customerProducts, stripeSubscription } = eventContext;

	const isNewPeriod = isStripeInvoiceForNewPeriod(stripeInvoice);
	const isVercelSubscription = isStripeSubscriptionVercel(stripeSubscription);
	if (!isNewPeriod || isVercelSubscription) return;

	const customerEntitlements = cusProductsToCusEnts({
		cusProducts: customerProducts,
		filters: {
			billingTypes: [BillingType.InArrearProrated],
		},
	});

	for (const customerEntitlement of customerEntitlements) {
		await processAllocatedPrice({
			ctx,
			eventContext,
			customerEntitlement,
		});
	}
};

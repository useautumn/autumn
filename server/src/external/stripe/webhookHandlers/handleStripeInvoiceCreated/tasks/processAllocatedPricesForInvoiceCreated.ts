import {
	BillingType,
	cusProductsToCusEnts,
	type FullCusEntWithFullCusProduct,
} from "@autumn/shared";
import { isStripeInvoiceForNewPeriod } from "@/external/stripe/invoices/utils/classifyStripeInvoice";
import { isStripeSubscriptionVercel } from "@/external/stripe/subscriptions/utils/classifyStripeSubscriptionUtils";
import type { InvoiceCreatedContext } from "@/external/stripe/webhookHandlers/handleStripeInvoiceCreated/setupInvoiceCreatedContext";
import type { StripeWebhookContext } from "@/external/stripe/webhookMiddlewares/stripeWebhookContext";
import type { AutumnBillingPlanBuilder } from "@/internal/billing/v2/utils/billingPlanBuilder/createAutumnBillingPlanBuilder";
import { findLinkedCusEnts } from "@/internal/customers/cusProducts/cusEnts/cusEntUtils/findCusEntUtils";
import { removeReplaceablesFromCusEnt } from "@/internal/customers/cusProducts/cusEnts/cusEntUtils/linkedCusEntUtils";
import { logAllocatedPriceProcessed } from "../logs/logInvoiceCreatedPriceProcessing";

/** Plans the seats freed at cycle end: their replaceables go, their entity entries leave the linked grants, and the seat grant gets them back. */
const processAllocatedPrice = ({
	ctx,
	plan,
	customerEntitlement,
}: {
	ctx: StripeWebhookContext;
	plan: AutumnBillingPlanBuilder;
	customerEntitlement: FullCusEntWithFullCusProduct;
}) => {
	const customerProduct = customerEntitlement.customer_product;
	const customerEntitlements = customerProduct?.customer_entitlements ?? [];

	const feature = customerEntitlement.entitlement.feature;
	const replaceables = customerEntitlement.replaceables.filter(
		(r) => r.delete_next_cycle,
	);

	if (replaceables.length === 0) return;

	const linkedCusEnts = findLinkedCusEnts({
		cusEnts: customerEntitlements,
		feature,
	});

	for (const linkedCusEnt of linkedCusEnts) {
		// A consumable reset earlier in the plan may have rewritten these entries; build on that, not the snapshot.
		const { newEntities } = removeReplaceablesFromCusEnt({
			cusEnt: plan.projectedCustomerEntitlement(linkedCusEnt),
			replaceableIds: replaceables.map((r) => r.id),
		});

		plan.updateCustomerEntitlement({
			customerEntitlement: linkedCusEnt,
			updates: { entities: newEntities },
		});
	}

	plan.updateCustomerEntitlement({
		customerEntitlement,
		balanceChange: replaceables.length,
		deletedReplaceables: replaceables,
	});

	logAllocatedPriceProcessed({
		ctx,
		customerEntitlement,
		replaceablesRemoved: replaceables.length,
		balanceIncremented: replaceables.length,
	});
};

export const processAllocatedPricesForInvoiceCreated = ({
	ctx,
	eventContext,
	plan,
}: {
	ctx: StripeWebhookContext;
	eventContext: InvoiceCreatedContext;
	plan: AutumnBillingPlanBuilder;
}): void => {
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
		processAllocatedPrice({ ctx, plan, customerEntitlement });
	}
};

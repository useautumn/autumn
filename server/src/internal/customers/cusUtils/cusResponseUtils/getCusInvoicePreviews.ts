import {
	type ApiInvoicePreviewV0,
	ApiInvoicePreviewV0Schema,
	billingContextToCurrency,
	CustomerExpand,
	customerProductsToStripeSubscriptionIds,
	type FullCusProduct,
	type FullCustomer,
	isCustomerProductOnStripeSubscription,
	notNullish,
	tryCatch,
} from "@autumn/shared";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import { getExpandedStripeCustomer } from "@/external/stripe/customers/operations/getExpandedStripeCustomer.js";
import {
	getExpandedStripeSubscription,
	stripeSubscriptionToNowMs,
} from "@/external/stripe/subscriptions/index.js";
import { buildBillingContextForInvoicePreview } from "@/external/stripe/webhookHandlers/common/buildBillingContextFromWebhook.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { extractStripeDiscounts } from "@/internal/billing/v2/providers/stripe/setup/fetchStripeDiscountsForBilling.js";
import { billingPlanToNextCyclePreview } from "@/internal/billing/v2/utils/billingPlan/toNextCyclePreview/billingPlanToNextCyclePreview.js";
import { CusService } from "../../CusService.js";

/**
 * Previews the upcoming invoice for each of the customer's Stripe
 * subscriptions, using the same line-item engine that bills them at renewal.
 */
export const getCusInvoicePreviews = async ({
	ctx,
	fullCus,
	expand,
}: {
	ctx: AutumnContext;
	fullCus: FullCustomer;
	expand?: CustomerExpand[];
}): Promise<ApiInvoicePreviewV0[] | undefined> => {
	if (!expand?.includes(CustomerExpand.InvoicePreviews)) return undefined;
	if (!fullCus.processor?.id) return undefined;

	// The caller's view is subject-scoped: at customer scope it omits
	// entity-scoped products, whose prices still bill on the customer's
	// subscription. Reload across every scope so the invoice is whole, and so
	// entity-level spend limits resolve against a populated `entities`.
	const fullCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: fullCus.internal_id,
		withEntities: true,
	});

	const subscriptionIds = customerProductsToStripeSubscriptionIds({
		customerProducts: fullCustomer.customer_products,
	});

	if (subscriptionIds.length === 0) return [];

	const stripeCli = createStripeCli({ org: ctx.org, env: ctx.env });
	const stripeCustomer = await getExpandedStripeCustomer({
		ctx,
		stripeCustomerId: fullCus.processor.id,
	});

	const previews = await Promise.all(
		subscriptionIds.map(async (subscriptionId) => {
			const isOnSubscription = (customerProduct: FullCusProduct) =>
				isCustomerProductOnStripeSubscription({
					customerProduct,
					stripeSubscriptionId: subscriptionId,
				}) === true;

			if (!fullCustomer.customer_products.some(isOnSubscription)) return null;

			const { data: stripeSubscription, error } = await tryCatch(
				getExpandedStripeSubscription({ ctx, subscriptionId }),
			);

			if (error || !stripeSubscription) {
				ctx.logger.warn(
					`[invoice_previews] skipping ${subscriptionId}: could not fetch from Stripe`,
					{ error },
				);
				return null;
			}

			const [nowMs, stripeDiscounts] = await Promise.all([
				stripeSubscriptionToNowMs({ stripeSubscription, stripeCli }),
				extractStripeDiscounts({ ctx, stripeSubscription, stripeCustomer }),
			]);

			const billingContext = buildBillingContextForInvoicePreview({
				fullCustomer,
				stripeSubscription,
				stripeCustomer,
				stripeDiscounts,
				nowMs,
			});

			const { nextCycle } = billingPlanToNextCyclePreview({
				ctx,
				billingContext,
				billingPlan: {
					autumn: {
						customerId: fullCustomer.id ?? "",
						insertCustomerProducts: [],
					},
					stripe: {},
				},
				customerProductFilter: isOnSubscription,
				options: { chargeUsageLineItems: true },
			});

			// Nothing recurring survives to the next boundary (e.g. cancelling).
			if (!nextCycle) {
				ctx.logger.info(
					`[invoice_previews] no next cycle for ${subscriptionId}`,
					{
						customerId: fullCustomer.id,
						anchorMs: billingContext.billingCycleAnchorMs,
						nowMs,
						customerProductIds: fullCustomer.customer_products
							.filter(isOnSubscription)
							.map((customerProduct) => customerProduct.id),
					},
				);
				return null;
			}

			return ApiInvoicePreviewV0Schema.parse({
				object: "invoice_preview",
				subscription_id: subscriptionId,
				// A boundary downgrade bills the outgoing plan's usage alongside the
				// incoming plan's base price, so an invoice can span two plans.
				plan_ids: [
					...new Set(nextCycle.line_items.map((lineItem) => lineItem.plan_id)),
				],
				invoice_at: nextCycle.starts_at,
				currency: billingContextToCurrency({ org: ctx.org, billingContext }),
				subtotal: nextCycle.subtotal,
				total: nextCycle.total,
				line_items: nextCycle.line_items,
			} satisfies ApiInvoicePreviewV0);
		}),
	);

	return previews.filter(notNullish);
};

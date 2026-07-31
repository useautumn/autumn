import type { AutumnBillingPlan, FullCusProduct, FullCustomer } from "@autumn/shared";
import { getStripePriceIdsForAutumnPrice } from "@/internal/billing/v2/providers/stripe/utils/sync/matchUtils/getStripePriceIdsForAutumnPrice";
import { initFullCustomerProductFromProduct } from "@/internal/billing/v2/utils/initFullCustomerProduct/initFullCustomerProductFromProduct";
import type { CheckoutSessionCompletedContext } from "@/external/stripe/webhookHandlers/handleStripeCheckoutSessionCompleted/setupCheckoutSessionCompletedContext";
import type { StripeWebhookContext } from "@/external/stripe/webhookMiddlewares/stripeWebhookContext";
import { ProductService } from "@/internal/products/ProductService";

/**
 * Stripe Checkout's `optional_items` upsell lands on the invoice as a plain
 * one-time line item — Autumn never requested it via `plan_id`, so it's
 * absent from `insertCustomerProducts`. Match any such leftover line item's
 * price against the org's product catalog and provision it alongside
 * whatever the caller originally requested.
 */
export const matchOptionalInvoiceItemsToProducts = async ({
	ctx,
	checkoutContext,
	autumnBillingPlan,
	fullCustomer,
}: {
	ctx: StripeWebhookContext;
	checkoutContext: CheckoutSessionCompletedContext;
	autumnBillingPlan: AutumnBillingPlan;
	fullCustomer: FullCustomer;
}): Promise<FullCusProduct[]> => {
	const invoiceLines = checkoutContext.stripeInvoice?.lines.data ?? [];
	if (invoiceLines.length === 0) return [];

	const alreadyCoveredStripePriceIds = new Set(
		autumnBillingPlan.insertCustomerProducts.flatMap((cusProduct) =>
			cusProduct.customer_prices.flatMap((cusPrice) =>
				getStripePriceIdsForAutumnPrice({ price: cusPrice.price }),
			),
		),
	);

	const leftoverStripePriceIds = invoiceLines
		.filter((line) => line.parent?.type === "invoice_item_details")
		.map((line) => line.pricing?.price_details?.price)
		.filter((stripePriceId): stripePriceId is string => Boolean(stripePriceId))
		.filter((stripePriceId) => !alreadyCoveredStripePriceIds.has(stripePriceId));

	if (leftoverStripePriceIds.length === 0) return [];

	const fullProducts = await ProductService.listFull({
		db: ctx.db,
		orgId: ctx.org.id,
		env: ctx.env,
	});

	const matchedProducts = leftoverStripePriceIds
		.map((stripePriceId) =>
			fullProducts.find((product) =>
				product.prices.some((price) =>
					getStripePriceIdsForAutumnPrice({ price }).includes(stripePriceId),
				),
			),
		)
		.filter((product): product is NonNullable<typeof product> =>
			Boolean(product),
		);

	if (matchedProducts.length === 0) return [];

	ctx.logger.info(
		`[checkout.completed] Matched optional_items to add-on(s) for customer ${fullCustomer.id}: ${matchedProducts.map((p) => p.id).join(", ")}`,
	);

	return matchedProducts.map((product) =>
		initFullCustomerProductFromProduct({
			ctx,
			initContext: {
				fullCustomer,
				fullProduct: product,
				currentEpochMs: Date.now(),
			},
		}),
	);
};

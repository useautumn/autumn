import type {
	AutumnBillingPlan,
	FullCusProduct,
	FullCustomer,
	FullProduct,
} from "@autumn/shared";
import { getStripePriceIdsForAutumnPrice } from "@/internal/billing/v2/providers/stripe/utils/sync/matchUtils/getStripePriceIdsForAutumnPrice";
import { initFullCustomerProductFromProduct } from "@/internal/billing/v2/utils/initFullCustomerProduct/initFullCustomerProductFromProduct";
import type { CheckoutSessionCompletedContext } from "@/external/stripe/webhookHandlers/handleStripeCheckoutSessionCompleted/setupCheckoutSessionCompletedContext";
import type { StripeWebhookContext } from "@/external/stripe/webhookMiddlewares/stripeWebhookContext";
import { ProductService } from "@/internal/products/ProductService";

export type OptionalInvoiceItemMatch = {
	fullProducts: FullProduct[];
	customerProducts: FullCusProduct[];
};

const EMPTY_MATCH: OptionalInvoiceItemMatch = {
	fullProducts: [],
	customerProducts: [],
};

/**
 * Stripe Checkout's `optional_items` upsell lands on the invoice as a plain
 * one-time line item — Autumn never requested it via `plan_id`, so it's
 * absent from `insertCustomerProducts`. Match any such leftover line item's
 * price against the org's product catalog and return both the matched
 * catalog product (so the caller can fold it into invoice construction) and
 * the provisioned customer product, scaled to the quantity purchased.
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
}): Promise<OptionalInvoiceItemMatch> => {
	const invoiceLines = checkoutContext.stripeInvoice?.lines.data ?? [];
	if (invoiceLines.length === 0) return EMPTY_MATCH;

	const alreadyCoveredStripePriceIds = new Set(
		autumnBillingPlan.insertCustomerProducts.flatMap((cusProduct) =>
			cusProduct.customer_prices.flatMap((cusPrice) =>
				getStripePriceIdsForAutumnPrice({ price: cusPrice.price }),
			),
		),
	);

	const leftoverLines = invoiceLines
		.filter((line) => line.parent?.type === "invoice_item_details")
		.map((line) => ({
			stripePriceId: line.pricing?.price_details?.price,
			quantity: line.quantity ?? 1,
		}))
		.filter(
			(entry): entry is { stripePriceId: string; quantity: number } =>
				Boolean(entry.stripePriceId) &&
				!alreadyCoveredStripePriceIds.has(entry.stripePriceId as string),
		);

	if (leftoverLines.length === 0) return EMPTY_MATCH;

	const fullProducts = await ProductService.listFull({
		db: ctx.db,
		orgId: ctx.org.id,
		env: ctx.env,
	});

	const matches = leftoverLines
		.map((entry) => {
			const product = fullProducts.find((candidate) =>
				candidate.prices.some((price) =>
					getStripePriceIdsForAutumnPrice({ price }).includes(
						entry.stripePriceId,
					),
				),
			);
			return product ? { product, quantity: entry.quantity } : null;
		})
		.filter((match): match is { product: FullProduct; quantity: number } =>
			Boolean(match),
		);

	if (matches.length === 0) return EMPTY_MATCH;

	ctx.logger.info(
		`[checkout.completed] Matched optional_items to add-on(s) for customer ${fullCustomer.id}: ${matches
			.map(({ product, quantity }) => `${product.id} x${quantity}`)
			.join(", ")}`,
	);

	const customerProducts = matches.map(({ product, quantity }) => {
		const customerProduct = initFullCustomerProductFromProduct({
			ctx,
			initContext: {
				fullCustomer,
				fullProduct: product,
				currentEpochMs: Date.now(),
			},
		});

		// initFullCustomerProductFromProduct always grants quantity 1 — scale to
		// what Checkout actually charged. Boolean/unlimited entitlements start
		// at balance 0 regardless, so this is a no-op for them.
		customerProduct.quantity = quantity;
		for (const cusEnt of customerProduct.customer_entitlements) {
			cusEnt.balance = (cusEnt.balance ?? 0) * quantity;
		}

		return customerProduct;
	});

	return {
		fullProducts: matches.map(({ product }) => product),
		customerProducts,
	};
};

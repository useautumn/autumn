import type { AppEnv, FullCusProduct } from "@autumn/shared";
import type Stripe from "stripe";
import type { DrizzleCli } from "@/db/initDrizzle";
import { getLatestPeriodEnd } from "@/external/stripe/stripeSubUtils/convertSubUtils";
import { ProductService } from "@/internal/products/ProductService";
import { PriceService } from "@/internal/products/prices/PriceService";
import type {
	SyncProposal,
	SyncProposalItem,
	SyncProposalStripeTier,
} from "../syncProposals";
import { matchSubscriptionItemToAutumn } from "./matchSubscriptionItemToAutumn";

/** Collects all Stripe price IDs from all subscription items. */
const collectStripePriceIds = ({
	stripeSubscriptions,
}: {
	stripeSubscriptions: Stripe.Subscription[];
}): string[] => {
	const priceIds = new Set<string>();
	for (const sub of stripeSubscriptions) {
		for (const item of sub.items.data) {
			if (item.price?.id) priceIds.add(item.price.id);
		}
	}
	return Array.from(priceIds);
};

/** Collects all Stripe product IDs from all subscription items. */
const collectStripeProductIds = ({
	stripeSubscriptions,
}: {
	stripeSubscriptions: Stripe.Subscription[];
}): string[] => {
	const productIds = new Set<string>();
	for (const sub of stripeSubscriptions) {
		for (const item of sub.items.data) {
			const productId =
				typeof item.price?.product === "string"
					? item.price.product
					: (item.price?.product as Stripe.Product | undefined)?.id;
			if (productId) productIds.add(productId);
		}
	}
	return Array.from(productIds);
};

/** Extracts the Stripe product ID string from a subscription item. */
const getStripeProductId = ({
	stripeItem,
}: {
	stripeItem: Stripe.SubscriptionItem;
}): string | null => {
	const product = stripeItem.price?.product;
	if (!product) return null;
	return typeof product === "string" ? product : (product.id ?? null);
};

/**
 * Batch-fetches Stripe product names for a list of product IDs.
 * Returns a map of productId -> name.
 */
const fetchStripeProductNames = async ({
	stripeCli,
	stripeProductIds,
}: {
	stripeCli: Stripe;
	stripeProductIds: string[];
}): Promise<Record<string, string>> => {
	if (stripeProductIds.length === 0) return {};

	const nameMap: Record<string, string> = {};
	const stripeProducts = await stripeCli.products.list({
		ids: stripeProductIds,
		limit: 100,
	});
	for (const product of stripeProducts.data) {
		nameMap[product.id] = product.name;
	}
	return nameMap;
};

/** Collects Stripe price IDs that use tiered billing (need a separate fetch for tiers). */
const collectTieredPriceIds = ({
	stripeSubscriptions,
}: {
	stripeSubscriptions: Stripe.Subscription[];
}): string[] => {
	const ids = new Set<string>();
	for (const sub of stripeSubscriptions) {
		for (const item of sub.items.data) {
			if (item.price?.billing_scheme === "tiered" && item.price.id)
				ids.add(item.price.id);
		}
	}
	return Array.from(ids);
};

/** Fetches full price objects (with tiers expanded) for tiered prices. */
const fetchTieredPriceTiers = async ({
	stripeCli,
	tieredPriceIds,
}: {
	stripeCli: Stripe;
	tieredPriceIds: string[];
}): Promise<Record<string, SyncProposalStripeTier[]>> => {
	if (tieredPriceIds.length === 0) return {};

	const tiersMap: Record<string, SyncProposalStripeTier[]> = {};
	const prices = await Promise.all(
		tieredPriceIds.map((id) =>
			stripeCli.prices.retrieve(id, { expand: ["tiers"] }),
		),
	);
	for (const price of prices) {
		if (!price.tiers) continue;
		tiersMap[price.id] = price.tiers.map((tier) => ({
			up_to: tier.up_to,
			unit_amount: tier.unit_amount,
			flat_amount: tier.flat_amount,
		}));
	}
	return tiersMap;
};

/** Extracts price metadata (amount, currency, billing scheme, tiers) from a Stripe subscription item. */
const extractPriceMetadata = ({
	stripeItem,
	tieredPriceTiers,
}: {
	stripeItem: Stripe.SubscriptionItem;
	tieredPriceTiers: Record<string, SyncProposalStripeTier[]>;
}): {
	unit_amount: number | null;
	currency: string | null;
	billing_scheme: "per_unit" | "tiered" | null;
	tiers_mode: "graduated" | "volume" | null;
	recurring_usage_type: "licensed" | "metered" | null;
	tiers: SyncProposalStripeTier[] | null;
} => {
	const price = stripeItem.price;
	if (!price)
		return {
			unit_amount: null,
			currency: null,
			billing_scheme: null,
			tiers_mode: null,
			recurring_usage_type: null,
			tiers: null,
		};

	const tiers: SyncProposalStripeTier[] | null =
		price.tiers?.map((tier) => ({
			up_to: tier.up_to,
			unit_amount: tier.unit_amount,
			flat_amount: tier.flat_amount,
		})) ??
		tieredPriceTiers[price.id] ??
		null;

	return {
		unit_amount: price.unit_amount ?? null,
		currency: price.currency ?? null,
		billing_scheme: (price.billing_scheme as "per_unit" | "tiered") ?? null,
		tiers_mode: (price.tiers_mode as "graduated" | "volume") ?? null,
		recurring_usage_type:
			(price.recurring?.usage_type as "licensed" | "metered") ?? null,
		tiers,
	};
};

/** Finds if this Stripe subscription is already linked to an Autumn customer product. */
const findLinkedProductId = ({
	stripeSubscriptionId,
	customerProducts,
}: {
	stripeSubscriptionId: string;
	customerProducts: FullCusProduct[];
}): string | null => {
	const linked = customerProducts.find((cp) =>
		cp.subscription_ids?.includes(stripeSubscriptionId),
	);
	return linked?.product?.id ?? null;
};

/**
 * Matches Stripe subscriptions to Autumn products using a multi-tier
 * fallback: stripe_price_id -> price config stripe_product_id -> product.processor.id
 */
export const matchStripeSubscriptionsToProducts = async ({
	db,
	orgId,
	env,
	stripeCli,
	stripeSubscriptions,
	customerProducts,
}: {
	db: DrizzleCli;
	orgId: string;
	env: AppEnv;
	stripeCli: Stripe;
	stripeSubscriptions: Stripe.Subscription[];
	customerProducts: FullCusProduct[];
}): Promise<SyncProposal[]> => {
	const allStripePriceIds = collectStripePriceIds({ stripeSubscriptions });
	const allStripeProductIds = collectStripeProductIds({ stripeSubscriptions });
	const tieredPriceIds = collectTieredPriceIds({ stripeSubscriptions });

	// Batch all lookups in parallel (DB + Stripe product names + tiered price tiers)
	const [
		priceByStripePriceId,
		priceByStripeProductId,
		productByStripeProductId,
		stripeProductNames,
		tieredPriceTiers,
	] = await Promise.all([
		PriceService.getByStripeIds({ db, stripePriceIds: allStripePriceIds }),
		PriceService.getByStripeProductIds({
			db,
			stripeProductIds: allStripeProductIds,
		}),
		ProductService.getByStripeProductIds({
			db,
			stripeProductIds: allStripeProductIds,
			orgId,
			env,
		}),
		fetchStripeProductNames({
			stripeCli,
			stripeProductIds: allStripeProductIds,
		}),
		fetchTieredPriceTiers({ stripeCli, tieredPriceIds }),
	]);

	const proposals: SyncProposal[] = [];

	for (const sub of stripeSubscriptions) {
		const items: SyncProposalItem[] = [];

		for (const stripeItem of sub.items.data) {
			const stripePriceId = stripeItem.price?.id;
			if (!stripePriceId) continue;

			const stripeProductId = getStripeProductId({ stripeItem });

			const match = matchSubscriptionItemToAutumn({
				stripeItem,
				priceByStripePriceId,
				priceByStripeProductId,
				productByStripeProductId,
			});

			const priceMetadata = extractPriceMetadata({
				stripeItem,
				tieredPriceTiers,
			});

			items.push({
				stripe_price_id: stripePriceId,
				stripe_product_id: stripeProductId,
				stripe_product_name: stripeProductId
					? (stripeProductNames[stripeProductId] ?? null)
					: null,
				quantity: stripeItem.quantity ?? null,
				...priceMetadata,
				matched_plan_id: match.product?.id ?? null,
				matched_plan_name: match.product?.name ?? null,
				matched_price_id: match.price?.id ?? null,
				match_method: match.matchMethod,
			});
		}

		proposals.push({
			stripe_subscription_id: sub.id,
			stripe_subscription_status: sub.status,
			current_period_end: getLatestPeriodEnd({ sub }),
			trial_end: sub.trial_end ?? null,
			cancel_at: sub.cancel_at ?? null,
			canceled_at: sub.canceled_at ?? null,
			already_linked_product_id: findLinkedProductId({
				stripeSubscriptionId: sub.id,
				customerProducts,
			}),
			items,
		});
	}

	return proposals;
};

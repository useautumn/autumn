import { isFixedPrice, type Price } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { findMatchingStripePriceForFixedPrice } from "@/internal/billing/v2/providers/stripe/utils/sync/matchUtils/stripePriceMatchesAutumnPrice";
// Both helpers move here when the legacy mappings endpoints retire.
import { clearDependentStripePriceFields } from "@/internal/catalog/actions/catalogMappings/catalogMappingUtils";
import { listExistingStripePricesByProduct } from "@/internal/catalog/actions/catalogMappings/updateMappings/matchExistingStripeBasePrice";
import type { UpsertProductPlan } from "@/internal/catalogV2/actions/updateCatalog/types/upsertProductPlan";
import { PriceService } from "@/internal/products/prices/PriceService";

type StrandedBasePrice = { price: Price; stripeProductId: string };

const stripePriceIdOf = ({ price }: { price?: Price }): string | null =>
	(price?.config as { stripe_price_id?: string | null } | undefined)
		?.stripe_price_id ?? null;

/**
 * A base price left under the product the plan just stopped mapping to. A price
 * the same request restated is left alone — the stated id owns it.
 */
const strandedBasePrice = ({
	upsert,
}: {
	upsert: UpsertProductPlan;
}): StrandedBasePrice[] => {
	const next = upsert.row.nextFullProduct;
	const current = upsert.row.currentFullProduct;
	if (!current) return [];

	const stripeProductId = next.processor?.id;
	if (!stripeProductId) return [];
	if (current.processor?.id === stripeProductId) return [];

	const price = next.prices.find(isFixedPrice);
	if (!price) return [];
	if (price.config.stripe_product_id === stripeProductId) return [];

	const currentPrice = current.prices.find(isFixedPrice);
	if (stripePriceIdOf({ price }) !== stripePriceIdOf({ price: currentPrice })) {
		return [];
	}

	return [{ price, stripeProductId }];
};

/**
 * A plan is billed under the Stripe product its base price belongs to, so a
 * changed product has to move that price as well — otherwise checkout keeps
 * charging the old product's price and the mapping is cosmetic. Reuses a price
 * already under the new product when one matches; otherwise clears the stale
 * ids so init mints a fresh one.
 */
export const repointBasePricesToPlanProcessor = async ({
	ctx,
	upsertProducts,
}: {
	ctx: AutumnContext;
	upsertProducts: UpsertProductPlan[];
}) => {
	const stranded = upsertProducts.flatMap((upsert) =>
		strandedBasePrice({ upsert }),
	);
	if (stranded.length === 0) return;

	const currency = ctx.org.default_currency || "usd";
	const pricesByProduct = await listExistingStripePricesByProduct({
		ctx,
		stripeProductIds: stranded.map((entry) => entry.stripeProductId),
	});

	for (const { price, stripeProductId } of stranded) {
		const matched = findMatchingStripePriceForFixedPrice({
			price,
			stripeProductId,
			stripePrices: pricesByProduct.get(stripeProductId) ?? [],
			currency,
		});

		price.config = clearDependentStripePriceFields({
			price,
			stripeProductId,
			stripePriceId: matched?.id ?? null,
		});

		await PriceService.update({
			db: ctx.db,
			id: price.id!,
			update: { config: price.config },
		});
	}
};

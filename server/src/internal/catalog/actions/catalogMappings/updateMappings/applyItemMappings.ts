import {
	type CatalogUpdateMappingsParams,
	ErrCode,
	RecaseError,
} from "@autumn/shared";
import { matchesPlanItemFilter } from "@utils/productV2Utils/productItemUtils/matchPlanItem.js";
import type { ContextsByPlanId } from "./loadMappingContexts.js";
import {
	type PriceTargets,
	normalizeStripeProductId,
	setPriceTarget,
} from "./updateMappingUtils.js";

export const applyItemMappings = ({
	params,
	contextsByPlanId,
	priceTargets,
}: {
	params: CatalogUpdateMappingsParams;
	contextsByPlanId: ContextsByPlanId;
	priceTargets: PriceTargets;
}) => {
	for (const planMapping of params.plan_mappings) {
		const contexts = contextsByPlanId.get(planMapping.plan_id) ?? [];

		for (const itemMapping of planMapping.item_mappings) {
			const stripeProductId = normalizeStripeProductId(
				itemMapping.stripe_product_id,
			);
			let matchedCount = 0;

			for (const context of contexts) {
				for (const entry of context.itemPrices) {
					if (
						!matchesPlanItemFilter({
							item: entry.item,
							filter: itemMapping.filter,
						})
					) {
						continue;
					}
					matchedCount++;
					setPriceTarget({
						targets: priceTargets,
						price: entry.price,
						product: context.product,
						priceId: entry.price.id,
						stripeProductId,
						source: "item",
						matchExistingStripePrice: true,
					});
				}
			}

			if (matchedCount === 0) {
				throw new RecaseError({
					message: `No price-backed items matched filter for plan ${planMapping.plan_id}`,
					code: ErrCode.InvalidRequest,
					statusCode: 400,
				});
			}
		}
	}
};

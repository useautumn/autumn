import {
	applyPlanItemParamsDiff,
	cusProductToEnts,
	cusProductToPrices,
	type FullCusProduct,
	mapToProductItems,
	type UpdateSubscriptionV1Params,
} from "@autumn/shared";
import { productItemsToCustomizePlanV1 } from "@autumn/shared/utils/productV2Utils/productItemUtils/convertProductItem/productItemsToCustomizePlanV1";
import type { AutumnContext } from "@/honoUtils/HonoEnv";

// Pending rows are inserted before is_custom is derived, so read customization off the rows themselves.
const hasCustomRows = (customerProduct: FullCusProduct) =>
	cusProductToPrices({ cusProduct: customerProduct }).some(
		(price) => price.is_custom,
	) ||
	cusProductToEnts({ cusProduct: customerProduct }).some(
		(entitlement) => entitlement.is_custom,
	);

/** Puts the edit on top of a custom pending plan's own price and items, as billing.update does for an active plan. */
export const pendingPlanToReattachCustomize = ({
	ctx,
	customize,
	customerProduct,
}: {
	ctx: AutumnContext;
	customize: UpdateSubscriptionV1Params["customize"];
	customerProduct: FullCusProduct;
}): UpdateSubscriptionV1Params["customize"] => {
	// update_items is deprecated and has no merge rule, so it keeps its catalog-based behavior.
	if (!hasCustomRows(customerProduct) || customize?.update_items) {
		return customize;
	}

	const current = productItemsToCustomizePlanV1({
		ctx,
		items: mapToProductItems({
			prices: cusProductToPrices({ cusProduct: customerProduct }),
			entitlements: cusProductToEnts({ cusProduct: customerProduct }),
			features: ctx.features,
		}),
	});
	const { add_items, remove_items, ...edit } = customize ?? {};

	return {
		...edit,
		price: edit.price !== undefined ? edit.price : current.price,
		items:
			edit.items ??
			applyPlanItemParamsDiff({
				items: current.items ?? [],
				add_items,
				remove_items,
			}),
	};
};

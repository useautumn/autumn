import {
	type CreatePlanItemParamsV1,
	ErrCode,
	mapToProductItems,
	RecaseError,
} from "@autumn/shared";
import type { BasePriceParams } from "@autumn/shared/api/products/components/basePrice/basePrice";
import { productItemsToCustomizePlanV1 } from "@autumn/shared/utils/productV2Utils/productItemUtils/convertProductItem/productItemsToCustomizePlanV1";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import type {
	ComputeEntitlementPricesPlanParams,
	EntitlementPricesCustomize,
} from "./types/computeEntitlementPricesPlanParams";

export type ResolvedEntitlementPricesDesired = {
	/** undefined = no base price in desired. */
	basePrice?: BasePriceParams | null;
	planItems: CreatePlanItemParamsV1[];
};

const hasCustomizeField = ({
	customize,
}: {
	customize: EntitlementPricesCustomize;
}): boolean =>
	customize.price !== undefined ||
	customize.items !== undefined ||
	customize.add_items !== undefined ||
	customize.remove_items !== undefined;

/**
 * Expand PUT/PATCH customize into a full desired basePrice + planItems set.
 * Omitted lanes are carried forward from currentRows so claim keeps them `same`.
 */
export const resolveEntitlementPricesCustomize = ({
	ctx,
	params,
}: {
	ctx: AutumnContext;
	params: ComputeEntitlementPricesPlanParams;
}): ResolvedEntitlementPricesDesired => {
	const { customize, currentRows } = params;

	if (!hasCustomizeField({ customize })) {
		throw new RecaseError({
			message:
				"computeEntitlementPricesPlan requires at least one of price, items, add_items, remove_items",
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}

	if (
		customize.items !== undefined &&
		(customize.add_items !== undefined || customize.remove_items !== undefined)
	) {
		throw new RecaseError({
			message:
				"customize.items (PUT-style) cannot be combined with add_items / remove_items (PATCH-style); pick one approach",
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}

	if (
		customize.add_items !== undefined ||
		customize.remove_items !== undefined
	) {
		throw new RecaseError({
			message:
				"customize.add_items / remove_items are not implemented for computeEntitlementPricesPlan yet",
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}

	const currentAsCustomize = productItemsToCustomizePlanV1({
		ctx,
		items: mapToProductItems({
			prices: currentRows?.prices ?? [],
			entitlements: currentRows?.entitlements ?? [],
			features: ctx.features,
		}),
	});

	const basePrice =
		customize.price !== undefined
			? customize.price
			: (currentAsCustomize.price ?? undefined);

	const planItems =
		customize.items !== undefined
			? customize.items
			: (currentAsCustomize.items ?? []);

	return { basePrice, planItems };
};

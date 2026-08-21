import {
	BillingMethod,
	EntInterval,
	type EntitlementPrice,
} from "@autumn/shared";
import { priceToBillingMethod } from "@autumn/shared/utils/productUtils/priceUtils/convertPriceUtils.js";
import { z } from "zod/v4";

/**
 * Compute's lowered residue of a PlanItemFilter — execute reads these fields
 * into SQL with no interval conversion.
 */
export const EntitlementPriceFilterSchema = z.object({
	feature_id: z.string().optional(),
	interval: z.nativeEnum(EntInterval).optional(),
	interval_count: z.number().int().positive().optional(),
	billing_method: z.nativeEnum(BillingMethod).optional(),
	included: z.number().optional(),
});

export type EntitlementPriceFilter = z.infer<
	typeof EntitlementPriceFilterSchema
>;

/** Same COALESCE semantics as entitlementPriceFilterSql, for compute guards. */
export const entitlementPriceFilterMatchesEntitlementPrice = ({
	filter,
	entitlementPrice,
}: {
	filter: EntitlementPriceFilter;
	entitlementPrice: EntitlementPrice;
}): boolean => {
	const { entitlement, price } = entitlementPrice;

	if (
		filter.feature_id !== undefined &&
		filter.feature_id !== entitlement.feature_id
	) {
		return false;
	}

	if (
		filter.billing_method !== undefined &&
		priceToBillingMethod({ price }) !== filter.billing_method
	) {
		return false;
	}

	if (
		filter.interval !== undefined &&
		(entitlement.interval ?? EntInterval.Lifetime) !== filter.interval
	) {
		return false;
	}

	if (
		filter.interval_count !== undefined &&
		(entitlement.interval_count ?? 1) !== filter.interval_count
	) {
		return false;
	}

	if (
		filter.included !== undefined &&
		entitlement.allowance !== filter.included
	) {
		return false;
	}

	return true;
};

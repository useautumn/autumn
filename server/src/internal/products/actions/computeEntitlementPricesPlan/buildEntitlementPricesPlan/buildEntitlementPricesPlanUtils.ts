import {
	type EntitlementPrice,
	type EntitlementWithFeature,
	type Price,
} from "@autumn/shared";
import { generateId } from "@/utils/genUtils";
import type { EntitlementPricesPlanMode } from "../types/computeEntitlementPricesPlanParams";
import type {
	EntitlementPricesPlan,
	RowBuckets,
} from "../types/entitlementPricesPlan";

/** Where unclaimed current rows go — null means ignore (version / custom). */
export const leaveBucketForMode = ({
	mode,
}: {
	mode: EntitlementPricesPlanMode;
}): keyof Pick<RowBuckets<unknown>, "deleted" | "retired"> | null => {
	if (mode.type === "version" || mode.type === "custom") return null;
	return mode.protectReferencedRows ? "retired" : "deleted";
};

/** Push both halves of an EP into the same bucket. */
export const pushEntitlementPrice = ({
	plan,
	bucket,
	entitlementPrice,
}: {
	plan: EntitlementPricesPlan;
	bucket: keyof RowBuckets<unknown>;
	entitlementPrice: EntitlementPrice;
}) => {
	plan.entitlements[bucket].push(entitlementPrice.entitlement);
	if (entitlementPrice.price) {
		plan.prices[bucket].push(entitlementPrice.price);
	}
};

/** Mint a new entitlement (+ optional price) with fresh ids for insert. */
export const withFreshIds = ({
	entitlementPrice,
	isCustom,
}: {
	entitlementPrice: EntitlementPrice;
	isCustom: boolean;
}): EntitlementPrice => {
	const entitlementId = generateId("ent");
	return {
		entitlement: {
			...entitlementPrice.entitlement,
			id: entitlementId,
			created_at: Date.now(),
			is_custom: isCustom,
		} as EntitlementWithFeature,
		price: entitlementPrice.price
			? {
					...entitlementPrice.price,
					id: generateId("pr"),
					created_at: Date.now(),
					is_custom: isCustom,
					entitlement_id: entitlementId,
				}
			: undefined,
	};
};

/** Mint a standalone price row with a fresh id for insert. */
export const withFreshPriceId = ({
	price,
	isCustom,
}: {
	price: Price;
	isCustom: boolean;
}): Price => ({
	...price,
	id: generateId("pr"),
	created_at: Date.now(),
	is_custom: isCustom,
});

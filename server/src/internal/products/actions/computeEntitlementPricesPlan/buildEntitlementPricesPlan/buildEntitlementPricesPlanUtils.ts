import type {
	EntitlementPrice,
	EntitlementWithFeature,
	Price,
} from "@autumn/shared";
import { generateId } from "@/utils/genUtils";
import type { EntitlementPricesPlanMode } from "../types/computeEntitlementPricesPlanParams";
import type {
	EntitlementPricesPlan,
	RowBuckets,
} from "../types/entitlementPricesPlan";

export const leaveBucketForMode = ({
	mode,
}: {
	mode: EntitlementPricesPlanMode;
}): keyof Pick<RowBuckets<unknown>, "deleted" | "retired"> | null => {
	if (mode.type === "version" || mode.type === "custom") return null;
	return "retired";
};

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

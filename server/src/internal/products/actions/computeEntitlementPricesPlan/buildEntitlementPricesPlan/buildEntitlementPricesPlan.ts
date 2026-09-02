import type { Price } from "@autumn/shared";
import type { ClaimResult } from "../types/claimResult";
import type { EntitlementPricesPlanMode } from "../types/computeEntitlementPricesPlanParams";
import {
	type EntitlementPricesPlan,
	emptyEntitlementPricesPlan,
} from "../types/entitlementPricesPlan";
import {
	leaveBucketForMode,
	pushEntitlementPrice,
	withFreshIds,
	withFreshPriceId,
} from "./buildEntitlementPricesPlanUtils";

/** Fixed prices bill from the v1 slot, prepaid from the v2 slot. */
const PRICE_MAPPING_SLOTS = [
	"stripe_price_id",
	"stripe_prepaid_price_v2_id",
] as const;

type PriceMapping = Partial<
	Record<(typeof PRICE_MAPPING_SLOTS)[number], string | null>
>;

const mappingOf = ({ price }: { price?: Price }): PriceMapping =>
	(price?.config ?? {}) as PriceMapping;

/**
 * A claim matches on price definition, which deliberately ignores Stripe ids —
 * billing depends on that. So a re-stated mapping arrives as a claimed pair and
 * would be dropped; carry it onto the row we keep instead. Desired only carries
 * a slot the request stated, so a plain edit produces nothing here.
 */
const restatedMapping = ({
	desired,
	current,
}: {
	desired?: Price;
	current?: Price;
}): PriceMapping | undefined => {
	if (!current) return undefined;

	const desiredMapping = mappingOf({ price: desired });
	const currentMapping = mappingOf({ price: current });
	const restated = PRICE_MAPPING_SLOTS.filter(
		(slot) => desiredMapping[slot] && desiredMapping[slot] !== currentMapping[slot],
	);
	if (restated.length === 0) return undefined;

	return Object.fromEntries(restated.map((slot) => [slot, desiredMapping[slot]]));
};

const withMapping = ({
	price,
	mapping,
}: {
	price: Price;
	mapping: PriceMapping;
}): Price => ({
	...price,
	config: { ...price.config, ...mapping } as Price["config"],
});

/**
 * Claims → same; unclaimed desired → new; unclaimed current → leave bucket by mode.
 * Version/custom ignore leaving; custom stamps is_custom on inserts.
 */
export const buildEntitlementPricesPlan = ({
	mode,
	claims,
}: {
	mode: EntitlementPricesPlanMode;
	claims: ClaimResult;
}): EntitlementPricesPlan => {
	const plan = emptyEntitlementPricesPlan();

	const isCustom = mode.type === "custom";
	const leaveBucket = leaveBucketForMode({ mode });

	for (const { desired, current } of claims.entitlementPriceClaims) {
		const mapping = restatedMapping({
			desired: desired.price,
			current: current.price,
		});

		if (!mapping || !current.price) {
			pushEntitlementPrice({ plan, bucket: "same", entitlementPrice: current });
			continue;
		}

		pushEntitlementPrice({
			plan,
			bucket: "updated",
			entitlementPrice: {
				...current,
				price: withMapping({ price: current.price, mapping }),
			},
		});
	}

	for (const entitlementPrice of claims.unclaimedDesiredEntitlementPrices) {
		pushEntitlementPrice({
			plan,
			bucket: "new",
			entitlementPrice: withFreshIds({ entitlementPrice, isCustom }),
		});
	}

	if (leaveBucket) {
		for (const entitlementPrice of claims.unclaimedCurrentEntitlementPrices) {
			pushEntitlementPrice({
				plan,
				bucket: leaveBucket,
				entitlementPrice,
			});
		}
	}

	if (claims.basePriceClaim) {
		const { desired, current } = claims.basePriceClaim;
		const mapping = restatedMapping({ desired, current });
		if (mapping) plan.prices.updated.push(withMapping({ price: current, mapping }));
		else plan.prices.same.push(current);
	}

	if (claims.unclaimedDesiredBasePrice) {
		plan.prices.new.push(
			withFreshPriceId({
				price: claims.unclaimedDesiredBasePrice,
				isCustom,
			}),
		);
	}

	if (leaveBucket && claims.unclaimedCurrentBasePrice) {
		plan.prices[leaveBucket].push(claims.unclaimedCurrentBasePrice);
	}

	return plan;
};

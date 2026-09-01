import {
	type Price,
	STRIPE_PRICE_MAPPING_SLOTS,
	type StripePriceMappingSlot,
} from "@autumn/shared";
import type { StripeMappingUnlinks } from "../helpers/stripeMappingUnlinks";
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

type PriceMapping = Partial<Record<StripePriceMappingSlot, string | null>>;

const mappingOf = ({ price }: { price?: Price }): PriceMapping =>
	(price?.config ?? {}) as PriceMapping;

/**
 * A claim matches on price definition, which deliberately ignores Stripe ids —
 * billing depends on that. So a re-stated mapping arrives as a claimed pair and
 * would be dropped; carry it onto the row we keep instead. Desired only carries
 * a slot the request stated, so a plain edit produces nothing here.
 *
 * A stated `null` is an unlink rather than a restate, and it cannot be read off
 * the desired row — an untouched slot is nullish there too — so it arrives as
 * `unlinkedSlots`. Only a slot that currently holds an id is worth writing.
 */
const restatedMapping = ({
	desired,
	current,
	unlinkedSlots,
}: {
	desired?: Price;
	current?: Price;
	unlinkedSlots?: StripePriceMappingSlot[];
}): PriceMapping | undefined => {
	if (!current) return undefined;

	const desiredMapping = mappingOf({ price: desired });
	const currentMapping = mappingOf({ price: current });
	const isUnlinked = ({ slot }: { slot: StripePriceMappingSlot }) =>
		unlinkedSlots?.includes(slot) ?? false;

	const restated = STRIPE_PRICE_MAPPING_SLOTS.filter((slot) =>
		isUnlinked({ slot })
			? Boolean(currentMapping[slot])
			: Boolean(desiredMapping[slot]) &&
				desiredMapping[slot] !== currentMapping[slot],
	);
	if (restated.length === 0) return undefined;

	return Object.fromEntries(
		restated.map((slot) => [
			slot,
			isUnlinked({ slot }) ? null : desiredMapping[slot],
		]),
	);
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
	unlinks,
}: {
	mode: EntitlementPricesPlanMode;
	claims: ClaimResult;
	/** Stripe mapping slots the request stated as `null`, by current price id. */
	unlinks?: StripeMappingUnlinks;
}): EntitlementPricesPlan => {
	const plan = emptyEntitlementPricesPlan();

	const isCustom = mode.type === "custom";
	const leaveBucket = leaveBucketForMode({ mode });

	for (const { desired, current } of claims.entitlementPriceClaims) {
		const mapping = restatedMapping({
			desired: desired.price,
			current: current.price,
			unlinkedSlots: current.price && unlinks?.get(current.price.id),
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
		const mapping = restatedMapping({
			desired,
			current,
			unlinkedSlots: unlinks?.get(current.id),
		});
		if (mapping)
			plan.prices.updated.push(withMapping({ price: current, mapping }));
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

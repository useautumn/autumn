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

export const buildEntitlementPricesPlan = ({
	mode,
	claims,
	unlinks,
}: {
	mode: EntitlementPricesPlanMode;
	claims: ClaimResult;
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

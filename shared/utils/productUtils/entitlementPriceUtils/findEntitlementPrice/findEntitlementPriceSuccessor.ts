import {
	EntitlementMatchPrecision,
	findEntitlementSuccessor,
} from "@utils/productUtils/entUtils/findEntitlement/findEntitlementSuccessor.js";
import { findPriceSuccessor } from "@utils/productUtils/priceUtils/findPrice/findPriceSuccessor.js";
import { entitlementPricesAreSame } from "../compareEntitlementPrice/entitlementPricesAreSame.js";
import type { EntitlementPrice } from "../entitlementPriceTypes.js";

export enum EntitlementPriceMatchPrecision {
	/** Same semantic entitlement and optional price definitions. */
	EntitlementAndPriceDefinition = "entitlement_and_price_definition",
	/** Same feature, derived billing type, billing interval, and interval count. */
	PriceIdentity = "price_identity",
	/** Same entitlement feature, reset interval, and interval count. */
	EntitlementInterval = "entitlement_interval",
	/** Same entitlement feature only. */
	EntitlementFeature = "entitlement_feature",
}

/** Candidate matching order from strongest to weakest. */
export const ENTITLEMENT_PRICE_MATCH_PRECISIONS = [
	EntitlementPriceMatchPrecision.EntitlementAndPriceDefinition,
	EntitlementPriceMatchPrecision.PriceIdentity,
	EntitlementPriceMatchPrecision.EntitlementInterval,
	EntitlementPriceMatchPrecision.EntitlementFeature,
] as const;

/** Compares price identity without comparing amounts or physical IDs. */
const entitlementPricesHaveSamePriceIdentity = ({
	sourceEntitlementPrice,
	candidateEntitlementPrice,
}: {
	sourceEntitlementPrice: EntitlementPrice;
	candidateEntitlementPrice: EntitlementPrice;
}) => {
	if (!sourceEntitlementPrice.price || !candidateEntitlementPrice.price) {
		return false;
	}

	return Boolean(
		findPriceSuccessor({
			sourcePrice: sourceEntitlementPrice.price,
			candidatePrices: [candidateEntitlementPrice.price],
		}),
	);
};

/** Compares the entitlements using only the requested precision. */
const entitlementPricesMatchEntitlementAtPrecision = ({
	sourceEntitlementPrice,
	candidateEntitlementPrice,
	matchPrecision,
}: {
	sourceEntitlementPrice: EntitlementPrice;
	candidateEntitlementPrice: EntitlementPrice;
	matchPrecision: EntitlementMatchPrecision;
}) =>
	Boolean(
		findEntitlementSuccessor({
			sourceEntitlement: sourceEntitlementPrice.entitlement,
			candidateEntitlements: [candidateEntitlementPrice.entitlement],
			matchPrecision,
		}),
	);

/** Applies one entitlement-price precision to a source and candidate. */
const entitlementPricesMatchAtPrecision = ({
	sourceEntitlementPrice,
	candidateEntitlementPrice,
	matchPrecision,
}: {
	sourceEntitlementPrice: EntitlementPrice;
	candidateEntitlementPrice: EntitlementPrice;
	matchPrecision: EntitlementPriceMatchPrecision;
}) => {
	switch (matchPrecision) {
		case EntitlementPriceMatchPrecision.EntitlementAndPriceDefinition:
			return entitlementPricesAreSame({
				entitlementPrice1: sourceEntitlementPrice,
				entitlementPrice2: candidateEntitlementPrice,
			});
		case EntitlementPriceMatchPrecision.PriceIdentity:
			return entitlementPricesHaveSamePriceIdentity({
				sourceEntitlementPrice,
				candidateEntitlementPrice,
			});
		case EntitlementPriceMatchPrecision.EntitlementInterval:
			return entitlementPricesMatchEntitlementAtPrecision({
				sourceEntitlementPrice,
				candidateEntitlementPrice,
				matchPrecision: EntitlementMatchPrecision.Interval,
			});
		case EntitlementPriceMatchPrecision.EntitlementFeature:
			return entitlementPricesMatchEntitlementAtPrecision({
				sourceEntitlementPrice,
				candidateEntitlementPrice,
				matchPrecision: EntitlementMatchPrecision.Feature,
			});
	}
};

/** Returns the first unclaimed candidate at the strongest available precision. */
export const findEntitlementPriceSuccessor = ({
	sourceEntitlementPrice,
	candidateEntitlementPrices,
	excludedEntitlementIds,
}: {
	sourceEntitlementPrice: EntitlementPrice;
	candidateEntitlementPrices: EntitlementPrice[];
	excludedEntitlementIds?: Set<string>;
}): EntitlementPrice | undefined => {
	for (const matchPrecision of ENTITLEMENT_PRICE_MATCH_PRECISIONS) {
		const candidate = candidateEntitlementPrices.find(
			(candidateEntitlementPrice) => {
				const candidateEntitlementId =
					candidateEntitlementPrice.entitlement.id;
				if (excludedEntitlementIds?.has(candidateEntitlementId)) return false;

				return entitlementPricesMatchAtPrecision({
					sourceEntitlementPrice,
					candidateEntitlementPrice,
					matchPrecision,
				});
			},
		);
		if (candidate) return candidate;
	}
	return undefined;
};

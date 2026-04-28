import type { Price } from "@autumn/shared";
import type { NormalizedStripeSyncCandidate } from "../normalizeStripeObject.js";
import { getStripePriceIdsForAutumnPrice } from "./getStripePriceIdsForAutumnPrice.js";

export const stripePriceIdMatchesAutumnPrice = ({
	candidate,
	price,
}: {
	candidate: NormalizedStripeSyncCandidate;
	price: Price;
}): boolean => {
	if (!candidate.stripePriceId) return false;

	return getStripePriceIdsForAutumnPrice({ price }).includes(candidate.stripePriceId);
};

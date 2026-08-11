import { type Price, pricesAreSame } from "@autumn/shared";
import type { ClaimedBasePrice } from "../types/claimResult";

/** Claim the sole base pair only when definitions match. */
export const claimBasePrice = ({
	desiredBasePrice,
	currentBasePrice,
}: {
	desiredBasePrice?: Price;
	currentBasePrice?: Price;
}): ClaimedBasePrice | undefined => {
	if (!desiredBasePrice || !currentBasePrice) return undefined;
	if (!pricesAreSame(desiredBasePrice, currentBasePrice)) return undefined;

	return {
		desired: desiredBasePrice,
		current: currentBasePrice,
	};
};

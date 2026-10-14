import {
	type Price,
	priceCurrencyDefinitionsAreSame,
	pricesAreSame,
} from "@autumn/shared";
import type { ClaimedBasePrice } from "../types/claimResult";

export const claimBasePrice = ({
	desiredBasePrice,
	currentBasePrice,
}: {
	desiredBasePrice?: Price;
	currentBasePrice?: Price;
}): ClaimedBasePrice | undefined => {
	if (!desiredBasePrice || !currentBasePrice) return undefined;
	if (!pricesAreSame(desiredBasePrice, currentBasePrice)) return undefined;
	if (!priceCurrencyDefinitionsAreSame(desiredBasePrice, currentBasePrice)) {
		return undefined;
	}

	return {
		desired: desiredBasePrice,
		current: currentBasePrice,
	};
};

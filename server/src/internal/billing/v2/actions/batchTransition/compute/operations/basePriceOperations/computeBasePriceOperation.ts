import { type Price, pricesAreSame } from "@autumn/shared";
import type { BasePriceOperation } from "../../../types/basePriceOperationTypes";
import type { BasePriceTransition } from "../../transitions/computeBasePriceTransition";

const priceHasSameDefinition = ({
	price,
	definition,
}: {
	price: Price;
	definition: Price;
}): boolean =>
	(price.entitlement_id ?? null) === (definition.entitlement_id ?? null) &&
	pricesAreSame(price, definition);

const matchingPriceIds = ({
	candidateOutgoingBasePrices,
	definition,
}: {
	candidateOutgoingBasePrices: Price[];
	definition: Price;
}): string[] => {
	const priceIds: string[] = [];
	for (const price of candidateOutgoingBasePrices) {
		if (priceHasSameDefinition({ price, definition })) {
			priceIds.push(price.id);
		}
	}
	return priceIds;
};

export const computeBasePriceOperation = ({
	basePriceTransition,
	candidateOutgoingBasePrices,
}: {
	basePriceTransition: BasePriceTransition | undefined;
	candidateOutgoingBasePrices: Price[];
}): BasePriceOperation | undefined => {
	if (!basePriceTransition) return undefined;

	if (basePriceTransition.type === "add") {
		const existingBasePriceIds = new Set<string>();
		for (const price of candidateOutgoingBasePrices) {
			existingBasePriceIds.add(price.id);
		}
		existingBasePriceIds.add(basePriceTransition.toPrice.id);
		return {
			type: "add",
			existingBasePriceIds: [...existingBasePriceIds],
			toPrice: basePriceTransition.toPrice,
		};
	}

	const fromPriceIds = matchingPriceIds({
		candidateOutgoingBasePrices,
		definition: basePriceTransition.fromPrice,
	});
	if (fromPriceIds.length === 0) return undefined;

	if (basePriceTransition.type === "remove") {
		return {
			type: "remove",
			fromPriceIds,
			fromPrice: basePriceTransition.fromPrice,
		};
	}

	const replacePriceIds = fromPriceIds.filter(
		(priceId) => priceId !== basePriceTransition.toPrice.id,
	);
	if (replacePriceIds.length === 0) return undefined;

	return {
		type: "replace",
		fromPriceIds: replacePriceIds,
		fromPrice: basePriceTransition.fromPrice,
		toPrice: basePriceTransition.toPrice,
	};
};

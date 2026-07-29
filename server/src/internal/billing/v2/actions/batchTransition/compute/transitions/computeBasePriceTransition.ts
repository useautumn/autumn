import {
	type FullProductWithoutLicenses,
	type Price,
	pricesAreSame,
	productToBasePrice,
} from "@autumn/shared";

export type BasePriceTransition =
	| { type: "add"; fromPrice: null; toPrice: Price }
	| { type: "remove"; fromPrice: Price; toPrice: null }
	| { type: "replace"; fromPrice: Price; toPrice: Price };

export const computeBasePriceTransition = ({
	fromProduct,
	toProduct,
}: {
	fromProduct: FullProductWithoutLicenses;
	toProduct: FullProductWithoutLicenses;
}): BasePriceTransition | undefined => {
	const fromPrice = productToBasePrice({ product: fromProduct });
	const toPrice = productToBasePrice({ product: toProduct });

	if (!fromPrice) {
		if (!toPrice) return undefined;
		return { type: "add", fromPrice, toPrice };
	}
	if (!toPrice) return { type: "remove", fromPrice, toPrice };

	const unchanged =
		fromPrice.id === toPrice.id && pricesAreSame(fromPrice, toPrice);
	if (unchanged) return undefined;

	return { type: "replace", fromPrice, toPrice };
};

import {
	billingControlsFromColumns,
	type CustomizePlanV1,
	type FullProduct,
	pickBillingControlColumns,
} from "@autumn/shared";

/** Overlays `customize.billing_controls` onto a product's billing-control columns. */
export const applyCustomizeBillingControlsToProduct = ({
	fullProduct,
	customize,
}: {
	fullProduct: FullProduct;
	customize?: CustomizePlanV1;
}): FullProduct => {
	if (!customize?.billing_controls) return fullProduct;

	return {
		...fullProduct,
		...pickBillingControlColumns(
			billingControlsFromColumns(customize.billing_controls),
		),
	};
};

/** Overlays `customize.billing_controls` onto the product within a resolved product context. */
export const applyCustomizeBillingControls = <
	TContext extends { fullProduct: FullProduct },
>({
	productContext,
	customize,
}: {
	productContext: TContext;
	customize?: CustomizePlanV1;
}): TContext => ({
	...productContext,
	fullProduct: applyCustomizeBillingControlsToProduct({
		fullProduct: productContext.fullProduct,
		customize,
	}),
});

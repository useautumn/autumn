import {
	type FrontendProduct,
	isPriceItem,
	productV2ToPlanType,
} from "@autumn/shared";

export const selectPaidPlanType = ({
	product,
}: {
	product: FrontendProduct;
}): FrontendProduct =>
	productV2ToPlanType({ product }) === "paid"
		? product
		: {
				...product,
				planType: "paid",
				basePriceType: "usage",
				is_default: false,
				items: product.items.filter((item) => !isPriceItem(item)),
			};

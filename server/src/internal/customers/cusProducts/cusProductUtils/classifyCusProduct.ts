import type { FullCusProduct } from "@autumn/shared";

export const isCanceled = ({ cusProduct }: { cusProduct: FullCusProduct }) => {
	return cusProduct.canceled;
};

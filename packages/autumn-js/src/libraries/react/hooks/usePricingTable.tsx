import { AutumnContext, useAutumnContext } from "../AutumnContext";
import type { ProductDetails } from "../client/ProductDetails";
import { usePricingTableBase } from "./usePricingTableBase";

export const usePricingTable = (params?: {
	productDetails?: ProductDetails[];
}) => {
	const context = useAutumnContext({
		AutumnContext,
		name: "usePricingTable",
	});

	return usePricingTableBase({
		client: context.client,
		params,
	});
};

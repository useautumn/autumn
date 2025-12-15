import type { Feature } from "../../featureModels/featureModels";
import type { Price } from "../../productModels/priceModels/priceModels";
import type { LineItemContext } from "./lineItemContext";

export type LineItem = {
	amount: number;
	description: string;
	price: Price;
	feature?: Feature; // Optional - fixed prices don't have features
	context: LineItemContext;
};

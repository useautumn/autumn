import type { FullCusEntWithFullCusProduct } from "@models/cusProductModels/cusEntModels/cusEntWithProduct";
import type { EntitlementWithFeature } from "@models/productModels/entModels/entModels";
import type { Price } from "../../productModels/priceModels/priceModels";
import type { FullProduct } from "../../productModels/productModels";

export type StripeItemSpec = {
	stripePriceId: string; // stripe price ID
	quantity?: number;
	autumnPrice?: Price;
	autumnEntitlement?: EntitlementWithFeature;
	autumnProduct?: FullProduct;
	autumnCusEnt?: FullCusEntWithFullCusProduct;
};

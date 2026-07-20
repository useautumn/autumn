import type { EntitlementWithFeature } from "@models/productModels/entModels/entModels";
import type { Price } from "@models/productModels/priceModels/priceModels";

export type EntitlementPrice = {
	entitlement: EntitlementWithFeature;
	price?: Price;
};

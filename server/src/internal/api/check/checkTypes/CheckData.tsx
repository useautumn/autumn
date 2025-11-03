import { FullCustomer, FullCusEntWithFullCusProduct, Feature, FullCusProduct, Entity } from "@autumn/shared";

export interface CheckData {
	fullCus: FullCustomer;
	cusEnts: FullCusEntWithFullCusProduct[];
	originalFeature: Feature;
	featureToUse: Feature;
	cusProducts: FullCusProduct[];
	entity?: Entity;
}
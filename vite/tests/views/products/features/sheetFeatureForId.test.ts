import { expect, test } from "bun:test";
import { type Feature, FeatureType } from "@autumn/shared";
import { sheetFeatureForId } from "@/views/products/features/utils/sheetFeatureForId";

const feature = (id: string, type: FeatureType) => ({ id, type }) as Feature;

const features = [
	feature("messages", FeatureType.Metered),
	feature("credits", FeatureType.CreditSystem),
	feature("ai-credits", FeatureType.AiCreditSystem),
];

test("opens a regular feature sheet from the feature id", () => {
	expect(sheetFeatureForId({ features, featureId: "messages" })).toEqual({
		selectedFeature: features[0],
		selectedCreditSystem: null,
	});
});

test("opens a credit-system sheet from the feature id", () => {
	expect(sheetFeatureForId({ features, featureId: "credits" })).toEqual({
		selectedFeature: null,
		selectedCreditSystem: features[1],
	});
	expect(sheetFeatureForId({ features, featureId: "ai-credits" })).toEqual({
		selectedFeature: null,
		selectedCreditSystem: features[2],
	});
});

test("opens nothing when the feature id is missing", () => {
	expect(sheetFeatureForId({ features, featureId: null })).toEqual({
		selectedFeature: null,
		selectedCreditSystem: null,
	});
	expect(sheetFeatureForId({ features, featureId: "missing" })).toEqual({
		selectedFeature: null,
		selectedCreditSystem: null,
	});
});

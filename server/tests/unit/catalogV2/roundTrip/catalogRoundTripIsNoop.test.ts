import { describe, expect, test } from "bun:test";
import { roundTripFeature, roundTripPlan } from "./catalogRoundTrip";
import { featureCases, planCaseGroups } from "./catalogRoundTripCases";

describe("catalog round trip: features", () => {
	for (const { name, feature } of featureCases) {
		test(name, () => expect(roundTripFeature({ feature })).toBeNull());
	}
});

for (const group of planCaseGroups) {
	describe(`catalog round trip: ${group.name}`, () => {
		for (const { name, product, features, org } of group.cases) {
			test(name, () =>
				expect(roundTripPlan({ product, features, org })).toBeNull(),
			);
		}
	});
}

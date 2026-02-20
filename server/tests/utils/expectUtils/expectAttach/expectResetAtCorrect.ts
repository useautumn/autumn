import type { ApiCustomerV3 } from "@autumn/shared";
import { expect } from "chai";

export const expectResetAtCorrect = ({
	cusBefore,
	cusAfter,
}: {
	cusBefore: ApiCustomerV3;
	cusAfter: ApiCustomerV3;
}) => {
	const featuresBefore = cusBefore.features;
	const featuresAfter = cusAfter.features;

	for (const featureId in featuresBefore) {
		const featureBefore = featuresBefore[featureId];
		if (!featureBefore.next_reset_at) {
			continue;
		}

		const featureAfter = featuresAfter[featureId];
		expect(featureAfter.next_reset_at).to.be.approximately(
			featureBefore.next_reset_at,
			10000,
			`reset for ${featureId} should be within 10 seconds`,
		);
	}
};

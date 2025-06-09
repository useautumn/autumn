import { Customer } from "autumn-js";
import { expect } from "chai";

export const expectResetAtCorrect = ({
  cusBefore,
  cusAfter,
}: {
  cusBefore: Customer;
  cusAfter: Customer;
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

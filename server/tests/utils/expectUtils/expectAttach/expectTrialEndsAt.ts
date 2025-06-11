import { Customer } from "autumn-js";
import { expect } from "chai";

export const expectTrialEndsAtCorrect = ({
  cusBefore,
  cusAfter,
}: {
  cusBefore: Customer;
  cusAfter: Customer;
}) => {
  let productsBefore = cusBefore.products;
  let productsAfter = cusAfter.products;

  for (const productBefore of productsBefore) {
    // @ts-ignore
    let trialEndsAtBefore = productBefore.trial_ends_at;

    if (!trialEndsAtBefore) {
      continue;
    }

    const productAfter = productsAfter.find((p) => p.id === productBefore.id);
    // @ts-ignore
    expect(productAfter?.trial_ends_at).to.equal(trialEndsAtBefore);
  }
};

import type { Customer } from "autumn-js";
import { expect } from "chai";

export const expectTrialEndsAtCorrect = ({
	cusBefore,
	cusAfter,
}: {
	cusBefore: Customer;
	cusAfter: Customer;
}) => {
	const productsBefore = cusBefore.products;
	const productsAfter = cusAfter.products;

	for (const productBefore of productsBefore) {
		// @ts-expect-error
		const trialEndsAtBefore = productBefore.trial_ends_at;

		if (!trialEndsAtBefore) {
			continue;
		}

		const productAfter = productsAfter.find((p) => p.id === productBefore.id);
		// @ts-expect-error
		expect(productAfter?.trial_ends_at).to.equal(trialEndsAtBefore);
	}
};

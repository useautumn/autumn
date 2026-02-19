import type { ApiCustomerV3 } from "@autumn/shared";
import { expect } from "chai";

export const expectTrialEndsAtCorrect = ({
	cusBefore,
	cusAfter,
}: {
	cusBefore: ApiCustomerV3;
	cusAfter: ApiCustomerV3;
}) => {
	const productsBefore = cusBefore.products;
	const productsAfter = cusAfter.products;

	for (const productBefore of productsBefore) {
		const trialEndsAtBefore = productBefore.current_period_end;

		if (!trialEndsAtBefore) {
			continue;
		}

		const productAfter = productsAfter.find((p) => p.id === productBefore.id);

		expect(productAfter?.current_period_end).to.equal(trialEndsAtBefore);
	}
};

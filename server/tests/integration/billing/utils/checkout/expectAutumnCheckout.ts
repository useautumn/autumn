import { expect } from "bun:test";
import type { BillingPreviewChange, GetCheckoutResponse } from "@autumn/shared";

export const expectAutumnCheckoutPreview = ({
	checkout,
	incomingPlanId,
	outgoingPlanId,
	featureQuantities,
}: {
	checkout: GetCheckoutResponse;
	incomingPlanId: string;
	outgoingPlanId?: string;
	featureQuantities?: Array<{ feature_id: string; quantity: number }>;
}): BillingPreviewChange => {
	const incomingChange = checkout.preview.incoming.find(
		(change) => change.plan_id === incomingPlanId,
	);

	expect(incomingChange).toBeDefined();

	if (featureQuantities) {
		expect(incomingChange?.feature_quantities).toEqual(
			expect.arrayContaining(featureQuantities),
		);
	}

	if (outgoingPlanId) {
		expect(
			checkout.preview.outgoing.some(
				(change) => change.plan_id === outgoingPlanId,
			),
		).toBe(true);
	}

	return incomingChange!;
};

import { expect } from "bun:test";
import type { ApiCustomerV5, ApiEntityV2 } from "@autumn/shared";

export const expectFlagCorrect = ({
	customer,
	featureId,
	planId,
	expiresAt,
	withFeature,
	present = true,
}: {
	customer: ApiCustomerV5 | ApiEntityV2;
	featureId: string;
	planId?: string | null;
	expiresAt?: number | null;
	withFeature?: boolean;
	present?: boolean;
}) => {
	const flag = customer.flags[featureId];

	if (!present) {
		expect(flag).toBeUndefined();
		return;
	}

	expect(flag).toBeDefined();
	expect(flag.feature_id).toBe(featureId);

	if (typeof planId !== "undefined") {
		expect(flag.plan_id).toBe(planId);
	}

	if (typeof expiresAt !== "undefined") {
		expect(flag.expires_at).toBe(expiresAt);
	}

	if (withFeature) {
		expect(flag.feature?.id).toBe(featureId);
	}
};

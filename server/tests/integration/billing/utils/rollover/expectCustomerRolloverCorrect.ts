import { expect } from "bun:test";
import type { ApiCustomerV3, ApiEntityV0 } from "@autumn/shared";

/**
 * Verify customer feature rollover state
 */
export const expectCustomerRolloverCorrect = ({
	customer,
	featureId,
	expectedRollovers,
	totalBalance,
}: {
	customer: ApiCustomerV3 | ApiEntityV0;
	featureId: string;
	expectedRollovers: { balance: number }[];
	totalBalance?: number;
}) => {
	const feature = customer.features?.[featureId];
	expect(feature, `Feature ${featureId} not found`).toBeDefined();

	const rollovers = feature?.rollovers ?? [];

	expect(
		rollovers.length,
		`Expected ${expectedRollovers.length} rollovers, got ${rollovers.length}`,
	).toBe(expectedRollovers.length);

	for (let i = 0; i < expectedRollovers.length; i++) {
		expect(rollovers[i]?.balance, `Rollover ${i} balance mismatch`).toBe(
			expectedRollovers[i].balance,
		);
	}

	if (totalBalance !== undefined) {
		expect(feature?.balance, "Total balance mismatch").toBe(totalBalance);
	}
};

/**
 * Verify customer feature has NO rollovers
 */
export const expectNoRollovers = ({
	customer,
	featureId,
}: {
	customer: ApiCustomerV3 | ApiEntityV0;
	featureId: string;
}) => {
	const feature = customer.features?.[featureId];
	expect(feature, `Feature ${featureId} not found`).toBeDefined();

	const rollovers = feature?.rollovers ?? [];
	expect(
		rollovers.length,
		`Expected 0 rollovers, got ${rollovers.length}`,
	).toBe(0);
};

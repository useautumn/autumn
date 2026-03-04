import { expect } from "bun:test";
import type { ApiCustomerV5 } from "@autumn/shared";

export const expectBalanceCorrect = ({
	customer,
	featureId,
	remaining,
}: {
	customer: ApiCustomerV5;
	featureId: string;
	remaining: number;
}) => {
	expect(customer.balances[featureId]).toBeDefined();
	expect(customer.balances[featureId].remaining).toBe(remaining);
};

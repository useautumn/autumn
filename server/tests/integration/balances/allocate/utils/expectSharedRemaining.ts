import { expect } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features.js";
import { pollableCustomerExpect } from "@tests/utils/pollableCustomerExpect.js";
import type { AutumnInt } from "@/external/autumn/autumnCli.js";

type SharedBalanceCustomer = {
	balances: Record<string, { remaining: number }>;
};

/** The customer's shared balance for messages, polled until entity tracks settle into the customer view. */
export const expectSharedRemaining = pollableCustomerExpect({
	fetchCustomer: ({
		customerId,
		autumn,
	}: {
		customerId?: string;
		customer?: SharedBalanceCustomer;
		autumn: AutumnInt;
		remaining: number;
	}) => autumn.customers.get<SharedBalanceCustomer>(customerId as string),
	assert: ({ customer, remaining }) => {
		expect(customer.balances[TestFeature.Messages].remaining).toBe(remaining);
	},
});

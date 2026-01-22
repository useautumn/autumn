import { createCustomerWithDefaults } from "./createWithDefaults/createCustomerWithDefaults.js";

export const customerActions = {
	createWithDefaults: createCustomerWithDefaults,
} as const;

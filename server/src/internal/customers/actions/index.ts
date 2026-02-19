import { deleteCustomer } from "@/internal/customers/actions/deleteCustomer.js";
import { updateCustomer } from "@/internal/customers/actions/update/updateCustomer.js";
import { createCustomerWithDefaults } from "./createWithDefaults/createCustomerWithDefaults.js";

export const customerActions = {
	createWithDefaults: createCustomerWithDefaults,
	update: updateCustomer,
	delete: deleteCustomer,
} as const;

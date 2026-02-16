import { oc } from "@orpc/contract";
import { attachContract } from "./attachContract.js";
import {
	deleteCustomerContract,
	getOrCreateCustomerContract,
	listCustomersContract,
	updateCustomerContract,
} from "./customersContract.js";
import { listPlansContract } from "./plansContract.js";

export const v2_1ContractRouter = oc.router({
	// Customers
	getOrCreateCustomer: getOrCreateCustomerContract,
	listCustomers: listCustomersContract,
	updateCustomer: updateCustomerContract,
	deleteCustomer: deleteCustomerContract,

	// Plans
	listPlans: listPlansContract,

	// Billing
	attach: attachContract,
});

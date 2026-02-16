import { oc } from "@orpc/contract";
import { attachContract } from "./attachContract.js";
import { getOrCreateCustomerContract } from "./customersContract.js";
import { listPlansContract } from "./plansContract.js";

export const v2_1ContractRouter = oc.router({
	getOrCreateCustomer: getOrCreateCustomerContract,
	listPlans: listPlansContract,
	attach: attachContract,
});

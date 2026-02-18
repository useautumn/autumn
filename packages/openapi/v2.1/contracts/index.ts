import { oc } from "@orpc/contract";
import {
	balancesCheckContract,
	balancesCreateContract,
	balancesTrackContract,
	balancesUpdateContract,
} from "./balancesContract.js";
import {
	billingAttachContract,
	billingPreviewAttachContract,
	billingPreviewUpdateContract,
	billingSetupPaymentContract,
	billingUpdateContract,
} from "./billingContract.js";
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
	billingAttach: billingAttachContract,
	billingPreviewAttach: billingPreviewAttachContract,
	billingUpdate: billingUpdateContract,
	billingPreviewUpdate: billingPreviewUpdateContract,
	billingSetupPayment: billingSetupPaymentContract,

	// Balances
	balancesCreate: balancesCreateContract,
	balancesUpdate: balancesUpdateContract,
	balancesCheck: balancesCheckContract,
	balancesTrack: balancesTrackContract,
});

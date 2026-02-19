import { oc } from "@orpc/contract";
import {
	balancesCheckContract,
	balancesCreateContract,
	balancesTrackContract,
	balancesUpdateContract,
} from "./balancesContract.js";
import {
	billingAttachContract,
	billingOpenCustomerPortalContract,
	billingPreviewAttachContract,
	billingPreviewUpdateContract,
	billingUpdateContract,
} from "./billingContract.js";
import {
	deleteCustomerContract,
	getOrCreateCustomerContract,
	listCustomersContract,
	updateCustomerContract,
} from "./customersContract.js";
import {
	createEntityContract,
	deleteEntityContract,
	getEntityContract,
} from "./entitiesContract.js";
import {
	eventsAggregateContract,
	eventsListContract,
} from "./eventsContract.js";
import { listPlansContract } from "./plansContract.js";
import {
	referralsCreateCodeContract,
	referralsRedeemCodeContract,
} from "./referralsContract.js";

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
	billingOpenCustomerPortal: billingOpenCustomerPortalContract,

	// Balances
	balancesCreate: balancesCreateContract,
	balancesUpdate: balancesUpdateContract,
	balancesCheck: balancesCheckContract,
	balancesTrack: balancesTrackContract,

	// Events
	eventsList: eventsListContract,
	eventsAggregate: eventsAggregateContract,

	// Entities
	entitiesCreate: createEntityContract,
	entitiesGet: getEntityContract,
	entitiesDelete: deleteEntityContract,

	// Referrals
	referralsCreateCode: referralsCreateCodeContract,
	referralsRedeemCode: referralsRedeemCodeContract,
});

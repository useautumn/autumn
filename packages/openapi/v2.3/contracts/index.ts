import { oc } from "@orpc/contract";
import {
	balancesBatchTrackContract,
	balancesCheckContract,
	balancesCreateContract,
	balancesDeleteContract,
	balancesFinalizeContract,
	balancesTrackContract,
	balancesTrackTokensContract,
	balancesUpdateContract,
} from "./balancesContract.js";
import {
	billingAttachContract,
	billingCreateScheduleContract,
	billingMultiAttachContract,
	billingOpenCustomerPortalContract,
	billingPreviewAttachContract,
	billingPreviewMultiAttachContract,
	billingPreviewUpdateContract,
	billingSetupPaymentContract,
	billingUpdateContract,
} from "./billingContract.js";
import { dfuFlashContract } from "./dfuContract.js";
import {
	deleteCustomerContract,
	getCustomerContract,
	getOrCreateCustomerContract,
	listCustomersContract,
	updateCustomerContract,
} from "./customersContract.js";
import {
	createEntityContract,
	deleteEntityContract,
	getEntityContract,
	listEntitiesContract,
	updateEntityContract,
} from "./entitiesContract.js";
import {
	eventsAggregateContract,
	eventsListContract,
} from "./eventsContract.js";
import {
	createFeatureContract,
	deleteFeatureContract,
	getFeatureContract,
	listFeaturesContract,
	updateFeatureContract,
} from "./featuresContract.js";
import {
	keysMintContract,
	keysRefreshContract,
	keysRevokeContract,
} from "./keysContract.js";
import {
	createPlanContract,
	deletePlanContract,
	getPlanContract,
	listPlansContract,
	updatePlanContract,
} from "./plansContract.js";
import {
	platformGetRevenueCatKeysContract,
	platformLinkRevenueCatContract,
	platformSyncRevenueCatContract,
} from "./platformContract.js";
import {
	referralsCreateCodeContract,
	referralsRedeemCodeContract,
	rewardsListContract,
	rewardsRedeemCodeContract,
} from "./referralsContract.js";

export const v2_3ContractRouter = oc.router({
	// Customers
	getOrCreateCustomer: getOrCreateCustomerContract,
	getCustomer: getCustomerContract,
	listCustomers: listCustomersContract,
	updateCustomer: updateCustomerContract,
	deleteCustomer: deleteCustomerContract,

	// Plans
	plansCreate: createPlanContract,
	plansGet: getPlanContract,
	plansList: listPlansContract,
	plansUpdate: updatePlanContract,
	plansDelete: deletePlanContract,

	// Features
	featuresCreate: createFeatureContract,
	featuresGet: getFeatureContract,
	featuresList: listFeaturesContract,
	featuresUpdate: updateFeatureContract,
	featuresDelete: deleteFeatureContract,

	// Billing
	billingAttach: billingAttachContract,
	billingCreateSchedule: billingCreateScheduleContract,
	billingMultiAttach: billingMultiAttachContract,
	billingPreviewAttach: billingPreviewAttachContract,
	billingPreviewMultiAttach: billingPreviewMultiAttachContract,
	billingUpdate: billingUpdateContract,
	billingPreviewUpdate: billingPreviewUpdateContract,
	billingOpenCustomerPortal: billingOpenCustomerPortalContract,
	billingSetupPayment: billingSetupPaymentContract,

	// DFU (customer imaging / live migration)
	dfuFlash: dfuFlashContract,

	// Balances
	balancesCreate: balancesCreateContract,
	balancesUpdate: balancesUpdateContract,
	balancesDelete: balancesDeleteContract,
	balancesFinalize: balancesFinalizeContract,
	balancesCheck: balancesCheckContract,
	balancesTrack: balancesTrackContract,
balancesTrackTokens: balancesTrackTokensContract,
	balancesBatchTrack: balancesBatchTrackContract,

	// Events
	eventsList: eventsListContract,
	eventsAggregate: eventsAggregateContract,

	// Entities
	entitiesCreate: createEntityContract,
	entitiesGet: getEntityContract,
	entitiesList: listEntitiesContract,
	entitiesUpdate: updateEntityContract,
	entitiesDelete: deleteEntityContract,

	// Rewards & Referrals
	referralsCreateCode: referralsCreateCodeContract,
	referralsRedeemCode: referralsRedeemCodeContract,
	rewardsList: rewardsListContract,
	rewardsRedeemCode: rewardsRedeemCodeContract,

	// Platform
	platformLinkRevenueCat: platformLinkRevenueCatContract,
	platformSyncRevenueCat: platformSyncRevenueCatContract,
	platformGetRevenueCatKeys: platformGetRevenueCatKeysContract,

	// Customer Keys (per-customer JWTs)
	keysMint: keysMintContract,
	keysRefresh: keysRefreshContract,
	keysRevoke: keysRevokeContract,
});

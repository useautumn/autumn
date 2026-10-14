import { oc } from "@orpc/contract";
import {
	balancesBatchTrackContract,
	balancesCheckContract,
	balancesCreateContract,
	balancesDeleteContract,
	balancesFinalizeContract,
	balancesListContract,
	balancesTrackContract,
	balancesTrackTokensContract,
	balancesUpdateContract,
} from "./balancesContract.js";
import {
	billingAttachContract,
	billingCreateScheduleContract,
	billingMultiAttachContract,
	billingMultiUpdateContract,
	billingOpenCustomerPortalContract,
	billingPreviewAttachContract,
	billingPreviewMultiAttachContract,
	billingPreviewMultiUpdateContract,
	billingPreviewUpdateContract,
	billingSetupPaymentContract,
	billingUpdateContract,
	billingVerifyContract,
	legacyBillingAdvanceTestClockContract,
} from "./billingContract.js";
import {
	catalogV2DiffContract,
	catalogV2GetContract,
	catalogV2PreviewUpdateContract,
	catalogV2UpdateContract,
} from "./catalogContract.js";
import {
	advanceTestClockContract,
	deleteCustomerContract,
	getCustomerContract,
	getOrCreateCustomerContract,
	listCustomersContract,
	listPurchasesContract,
	listSubscriptionsContract,
	updateCustomerContract,
} from "./customersContract.js";
import { dfuFlashContract } from "./dfuContract.js";
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
	createInvoiceContract,
	finalizeInvoiceContract,
	insertInvoicesContract,
	issueCreditNoteContract,
	listInvoicesContract,
	listInvoiceTemplatesContract,
	payInvoiceContract,
	reissueInvoiceContract,
	updateInvoiceContract,
	voidInvoiceContract,
} from "./invoicesContract.js";
import {
	keysMintContract,
	keysRefreshContract,
	keysRevokeContract,
} from "./keysContract.js";
import {
	attachLicenseContract,
	listLicenseAssignmentsContract,
	listLicensesContract,
	releaseLicenseContract,
} from "./licensesContract.js";
import { logsSearchContract } from "./logsContract.js";
import {
	organizationPreviewUpdateContract,
	organizationUpdateContract,
} from "./organizationContract.js";
import {
	createPlanContract,
	deletePlanContract,
	getPlanContract,
	listPlansContract,
	updatePlanContract,
} from "./plansContract.js";
import {
	platformDisconnectStripeContract,
	platformGetRevenueCatKeysContract,
	platformGetStripeConnectionContract,
	platformLinkRevenueCatContract,
	platformSyncRevenueCatContract,
} from "./platformContract.js";
import {
	referralProgramsCreateContract,
	referralProgramsDeleteContract,
	referralProgramsGetContract,
	referralProgramsListContract,
	referralProgramsUpdateContract,
	referralsCreateCodeContract,
	referralsRedeemCodeContract,
	rewardsCreateContract,
	rewardsDeleteContract,
	rewardsGetContract,
	rewardsListContract,
	rewardsRedeemCodeContract,
	rewardsUpdateContract,
} from "./referralsContract.js";
import {
	createSandboxContract,
	createSandboxKeyContract,
	deleteSandboxContract,
	listSandboxesContract,
	resetSandboxContract,
} from "./sandboxesContract.js";
import {
	createWebhookContract,
	deleteWebhookContract,
	getWebhookContract,
	listWebhooksContract,
	previewSyncWebhooksContract,
	syncWebhooksContract,
	updateWebhookContract,
} from "./webhooksContract.js";

export const v2_3ContractRouter = oc.router({
	getOrCreateCustomer: getOrCreateCustomerContract,
	getCustomer: getCustomerContract,
	listCustomers: listCustomersContract,
	updateCustomer: updateCustomerContract,
	deleteCustomer: deleteCustomerContract,
	advanceTestClock: advanceTestClockContract,
	listSubscriptions: listSubscriptionsContract,
	listPurchases: listPurchasesContract,

	plansCreate: createPlanContract,
	plansGet: getPlanContract,
	plansList: listPlansContract,
	plansUpdate: updatePlanContract,
	plansDelete: deletePlanContract,

	featuresCreate: createFeatureContract,
	featuresGet: getFeatureContract,
	featuresList: listFeaturesContract,
	featuresUpdate: updateFeatureContract,
	featuresDelete: deleteFeatureContract,

	billingAttach: billingAttachContract,
	billingAdvanceTestClock: legacyBillingAdvanceTestClockContract,
	billingCreateSchedule: billingCreateScheduleContract,
	billingMultiAttach: billingMultiAttachContract,
	billingPreviewAttach: billingPreviewAttachContract,
	billingPreviewMultiAttach: billingPreviewMultiAttachContract,
	billingUpdate: billingUpdateContract,
	billingPreviewUpdate: billingPreviewUpdateContract,
	billingMultiUpdate: billingMultiUpdateContract,
	billingPreviewMultiUpdate: billingPreviewMultiUpdateContract,
	billingOpenCustomerPortal: billingOpenCustomerPortalContract,
	billingSetupPayment: billingSetupPaymentContract,
	billingVerify: billingVerifyContract,

	dfuFlash: dfuFlashContract,

	balancesCreate: balancesCreateContract,
	balancesList: balancesListContract,
	balancesUpdate: balancesUpdateContract,
	balancesDelete: balancesDeleteContract,
	balancesFinalize: balancesFinalizeContract,
	balancesCheck: balancesCheckContract,
	balancesTrack: balancesTrackContract,
	balancesTrackTokens: balancesTrackTokensContract,
	balancesBatchTrack: balancesBatchTrackContract,

	eventsList: eventsListContract,
	eventsAggregate: eventsAggregateContract,

	logsSearch: logsSearchContract,

	invoicesCreate: createInvoiceContract,
	invoicesFinalize: finalizeInvoiceContract,
	invoicesInsert: insertInvoicesContract,
	invoicesList: listInvoicesContract,
	invoicesListTemplates: listInvoiceTemplatesContract,
	invoicesPay: payInvoiceContract,
	invoicesIssueCreditNote: issueCreditNoteContract,
	invoicesReissue: reissueInvoiceContract,
	invoicesUpdate: updateInvoiceContract,
	invoicesVoid: voidInvoiceContract,

	licensesAttach: attachLicenseContract,
	licensesRelease: releaseLicenseContract,
	licensesListAssignments: listLicenseAssignmentsContract,
	licensesList: listLicensesContract,

	entitiesCreate: createEntityContract,
	entitiesGet: getEntityContract,
	entitiesList: listEntitiesContract,
	entitiesUpdate: updateEntityContract,
	entitiesDelete: deleteEntityContract,

	referralsCreateCode: referralsCreateCodeContract,
	referralsRedeemCode: referralsRedeemCodeContract,
	referralProgramsCreate: referralProgramsCreateContract,
	referralProgramsList: referralProgramsListContract,
	referralProgramsGet: referralProgramsGetContract,
	referralProgramsUpdate: referralProgramsUpdateContract,
	referralProgramsDelete: referralProgramsDeleteContract,
	rewardsCreate: rewardsCreateContract,
	rewardsList: rewardsListContract,
	rewardsGet: rewardsGetContract,
	rewardsUpdate: rewardsUpdateContract,
	rewardsDelete: rewardsDeleteContract,
	rewardsRedeemCode: rewardsRedeemCodeContract,

	platformGetStripeConnection: platformGetStripeConnectionContract,
	platformDisconnectStripe: platformDisconnectStripeContract,
	platformLinkRevenueCat: platformLinkRevenueCatContract,
	platformSyncRevenueCat: platformSyncRevenueCatContract,
	platformGetRevenueCatKeys: platformGetRevenueCatKeysContract,

	keysMint: keysMintContract,
	keysRefresh: keysRefreshContract,
	keysRevoke: keysRevokeContract,

	sandboxesCreate: createSandboxContract,
	sandboxesList: listSandboxesContract,
	sandboxesDelete: deleteSandboxContract,
	sandboxesReset: resetSandboxContract,

	webhooksCreate: createWebhookContract,
	webhooksGet: getWebhookContract,
	webhooksList: listWebhooksContract,
	webhooksUpdate: updateWebhookContract,
	webhooksDelete: deleteWebhookContract,
	webhooksPreviewSync: previewSyncWebhooksContract,
	webhooksSync: syncWebhooksContract,
});

export const v2_3InternalContractRouter = oc.router({
	...v2_3ContractRouter,

	catalogV2Get: catalogV2GetContract,
	catalogV2Diff: catalogV2DiffContract,
	catalogV2PreviewUpdate: catalogV2PreviewUpdateContract,
	catalogV2Update: catalogV2UpdateContract,

	sandboxesCreateKey: createSandboxKeyContract,

	organizationPreviewUpdate: organizationPreviewUpdateContract,
	organizationUpdate: organizationUpdateContract,
});

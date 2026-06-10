/* TABLES */

// Analytics Tables
import { actions } from "../models/analyticsModels/actionTable.js";
import {
	chatApprovals,
	chatInstallations,
	chatOAuthCredentials,
} from "../models/chatModels/chatTable.js";
import { chatResults } from "../models/chatResultModels/chatResultTable.js";
import { checkoutsRelations } from "../models/checkouts/checkoutRelations.js";
import { checkouts } from "../models/checkouts/checkoutTable.js";
import { autoTopupLimitStates } from "../models/cusModels/billingControls/autoTopupLimitTable.js";
// Customer Relations
import { customersRelations } from "../models/cusModels/cusRelations.js";
// Customer Tables
import { customers } from "../models/cusModels/cusTable.js";
import { entitiesRelations } from "../models/cusModels/entityModels/entityRelations.js";
import { entities } from "../models/cusModels/entityModels/entityTable.js";
import { invoiceLineItems } from "../models/cusModels/invoiceModels/invoiceLineItemTable.js";
import { invoiceRelations } from "../models/cusModels/invoiceModels/invoiceRelations.js";
import { invoices } from "../models/cusModels/invoiceModels/invoiceTable.js";
import { customerEntitlementsRelations } from "../models/cusProductModels/cusEntModels/cusEntRelations.js";
import { customerEntitlements } from "../models/cusProductModels/cusEntModels/cusEntTable.js";
import { replaceableRelations } from "../models/cusProductModels/cusEntModels/replaceableRelations.js";
import { replaceables } from "../models/cusProductModels/cusEntModels/replaceableTable.js";
import { rolloverRelations } from "../models/cusProductModels/cusEntModels/rolloverModels/rolloverRelations.js";
import { rollovers } from "../models/cusProductModels/cusEntModels/rolloverModels/rolloverTable.js";
import { customerPricesRelations } from "../models/cusProductModels/cusPriceModels/cusPriceRelations.js";
import { customerPrices } from "../models/cusProductModels/cusPriceModels/cusPriceTable.js";
// CusProduct Relations
import { customerProductsRelations } from "../models/cusProductModels/cusProductRelations.js";
// CusProduct Tables
import { customerProducts } from "../models/cusProductModels/cusProductTable.js";
import { apiKeyRelations } from "../models/devModels/apiKeyRelations.js";
// Other Tables
import { apiKeys } from "../models/devModels/apiKeyTable.js";
import { events } from "../models/eventModels/eventTable.js";
import { featureRelations } from "../models/featureModels/featureRelations.js";
import { features } from "../models/featureModels/featureTable.js";
import { invoiceTemplates } from "../models/invoiceTemplateModels/invoiceTemplateTable.js";
// Migration Relations
import { migrationErrorRelations } from "../models/migrationModels/migrationErrorRelations.js";
import { migrationErrors } from "../models/migrationModels/migrationErrorTable.js";
// Migration Tables
import { migrationJobs } from "../models/migrationModels/migrationJobTable.js";
// Migrations V2
import { migrationItemRuns } from "../models/migrationV2Models/migrationItemRunTable.js";
import { migrationRunsRelations } from "../models/migrationV2Models/migrationRunRelations.js";
import { migrationRuns } from "../models/migrationV2Models/migrationRunTable.js";
import { migrations } from "../models/migrationV2Models/migrationTable.js";
/* RELATIONS */
import { agentRules } from "../models/orgModels/agent/agentRulesTable.js";
import { organizationsRelations } from "../models/orgModels/orgRelations.js";
import { organizations } from "../models/orgModels/orgTable.js";
import { metadata } from "../models/otherModels/metadataTable.js";
import { revenuecatMappings } from "../models/processorModels/revenuecatModels/revenuecatMappingsTable.js";
import { vercelResources } from "../models/processorModels/vercelModels/vercelResourcesTable.js";
// Product Relations
import { entitlementsRelations } from "../models/productModels/entModels/entRelations.js";
import { entitlements } from "../models/productModels/entModels/entTable.js";
import { freeTrialRelations } from "../models/productModels/freeTrialModels/freeTrialRelations.js";
import { freeTrials } from "../models/productModels/freeTrialModels/freeTrialTable.js";
import { priceRelations } from "../models/productModels/priceModels/priceRelations.js";
import { prices } from "../models/productModels/priceModels/priceTable.js";
import { productRelations } from "../models/productModels/productRelations.js";
// Product Tables
import { products } from "../models/productModels/productTable.js";
import { referralCodeRelations } from "../models/rewardModels/referralModels/referralCodeRelations.js";
import { referralCodes } from "../models/rewardModels/referralModels/referralCodeTable.js";
import { rewardRedemptionRelations } from "../models/rewardModels/referralModels/rewardRedemptionRelations.js";
import { rewardRedemptions } from "../models/rewardModels/referralModels/rewardRedemptionTable.js";
// Reward Relations
import { rewardRelations } from "../models/rewardModels/rewardModels/rewardRelations.js";
// Reward Tables
import { rewards } from "../models/rewardModels/rewardModels/rewardTable.js";
import { rewardProgramRelations } from "../models/rewardModels/rewardProgramModels/rewardProgramRelations.js";
import { rewardPrograms } from "../models/rewardModels/rewardProgramModels/rewardProgramTable.js";
import {
	schedulePhases,
	schedules,
} from "../models/scheduleModels/scheduleTable.js";
import { subscriptions } from "../models/subModels/subTable.js";
import {
	inviteRelations,
	memberRelations,
	userRelations,
} from "./auth-relations.js";
import {
	account,
	invitation,
	jwks,
	member,
	oauthAccessToken,
	oauthClient,
	oauthConsent,
	oauthRefreshToken,
	passkey,
	session,
	user,
	verification,
} from "./auth-schema.js";

export {
	account,
	actions,
	apiKeyRelations,
	apiKeys,
	autoTopupLimitStates as autoTopupLimits,
	chatApprovals,
	chatInstallations,
	chatOAuthCredentials,
	chatResults,
	checkouts,
	checkoutsRelations,
	customerEntitlements,
	customerEntitlementsRelations,
	customerPrices,
	customerPricesRelations,
	customerProducts,
	customerProductsRelations,
	customers,
	customersRelations,
	entities,
	entitiesRelations,
	entitlements,
	entitlementsRelations,
	events,
	featureRelations,
	features,
	freeTrialRelations,
	freeTrials,
	invitation,
	inviteRelations,
	invoiceLineItems,
	invoiceRelations,
	invoiceTemplates,
	invoices,
	// OAuth Provider
	jwks,
	member,
	memberRelations,
	metadata,
	migrationErrorRelations,
	migrationErrors,
	migrationItemRuns,
	migrationJobs,
	migrationRuns,
	migrationRunsRelations,
	migrations,
	oauthAccessToken,
	oauthClient,
	oauthConsent,
	oauthRefreshToken,
	agentRules,
	// Tables
	organizations,
	passkey,
	// Relations
	organizationsRelations,
	priceRelations,
	prices,
	productRelations,
	products,
	rewardRelations,
	rewardProgramRelations,
	referralCodeRelations,
	referralCodes,
	replaceableRelations,
	replaceables,
	revenuecatMappings as revcatMappings,
	rewardPrograms,
	rewardRedemptionRelations,
	rewardRedemptions,
	rewards,
	rolloverRelations,
	rollovers,
	schedulePhases,
	schedules,
	session,
	subscriptions,
	// Auth
	user,
	// Auth Relations
	userRelations,
	vercelResources,
	verification,
};

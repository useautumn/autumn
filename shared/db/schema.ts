/* TABLES */

// Analytics Tables
import { actions } from "../models/analyticsModels/actionTable.js";
import { chatResults } from "../models/chatResultModels/chatResultTable.js";
import { checkoutsRelations } from "../models/checkouts/checkoutRelations.js";
import { checkouts } from "../models/checkouts/checkoutTable.js";
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
// Migration Relations
import { migrationErrorRelations } from "../models/migrationModels/migrationErrorRelations.js";
import { migrationErrors } from "../models/migrationModels/migrationErrorTable.js";
// Migration Tables
import { migrationJobs } from "../models/migrationModels/migrationJobTable.js";
/* RELATIONS */
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
// Reward Tables
import { rewards } from "../models/rewardModels/rewardModels/rewardTable.js";
// Reward Relations
import { rewardProgramRelations } from "../models/rewardModels/rewardProgramModels/rewardProgramRelations.js";
import { rewardPrograms } from "../models/rewardModels/rewardProgramModels/rewardProgramTable.js";
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
	session,
	user,
	verification,
} from "./auth-schema.js";

export {
	// Tables
	organizations,
	chatResults,
	checkouts,
	freeTrials,
	entitlements,
	prices,
	features,
	products,
	customerProducts,
	customerPrices,
	customerEntitlements,
	invoices,
	invoiceLineItems,
	customers,
	entities,
	apiKeys,
	metadata,
	subscriptions,
	rewards,
	rewardPrograms,
	referralCodes,
	rewardRedemptions,
	migrationJobs,
	migrationErrors,
	actions,
	events,
	replaceables,
	rollovers,
	vercelResources,
	revenuecatMappings as revcatMappings,
	// Auth
	user,
	session,
	account,
	verification,
	member,
	invitation,
	// OAuth Provider
	jwks,
	oauthClient,
	oauthAccessToken,
	oauthRefreshToken,
	oauthConsent,
	// Relations
	organizationsRelations,
	entitlementsRelations,
	featureRelations,
	priceRelations,
	productRelations,
	freeTrialRelations,
	customerProductsRelations,
	customerPricesRelations,
	customerEntitlementsRelations,
	customersRelations,
	entitiesRelations,
	apiKeyRelations,
	rewardProgramRelations,
	referralCodeRelations,
	rewardRedemptionRelations,
	migrationErrorRelations,
	replaceableRelations,
	invoiceRelations,
	rolloverRelations,
	checkoutsRelations,
	// Auth Relations
	userRelations,
	memberRelations,
	inviteRelations,
};

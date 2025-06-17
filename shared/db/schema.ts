/* TABLES */
import { organizations } from "../models/orgModels/orgTable.js";
import { chatResults } from "../models/chatResultModels/chatResultTable.js";
import { features } from "../models/featureModels/featureTable.js";

// Customer Tables
import { customers } from "../models/cusModels/cusTable.js";
import { entities } from "../models/cusModels/entityModels/entityTable.js";

// Product Tables
import { products } from "../models/productModels/productTable.js";
import { prices } from "../models/productModels/priceModels/priceTable.js";
import { entitlements } from "../models/productModels/entModels/entTable.js";
import { freeTrials } from "../models/productModels/freeTrialModels/freeTrialTable.js";

// CusProduct Tables
import { customerProducts } from "../models/cusProductModels/cusProductTable.js";
import { customerPrices } from "../models/cusProductModels/cusPriceModels/cusPriceTable.js";
import { customerEntitlements } from "../models/cusProductModels/cusEntModels/cusEntTable.js";

// Other Tables
import { apiKeys } from "../models/devModels/apiKeyTable.js";
import { metadata } from "../models/otherModels/metadataTable.js";
import { subscriptions } from "../models/subModels/subTable.js";
import { invoices } from "../models/cusModels/invoiceModels/invoiceTable.js";

// Reward Tables
import { rewards } from "../models/rewardModels/rewardModels/rewardTable.js";
import { rewardPrograms } from "../models/rewardModels/rewardProgramModels/rewardProgramTable.js";
import { referralCodes } from "../models/rewardModels/referralModels/referralCodeTable.js";
import { rewardRedemptions } from "../models/rewardModels/referralModels/rewardRedemptionTable.js";

// Migration Tables
import { migrationJobs } from "../models/migrationModels/migrationJobTable.js";
import { migrationErrors } from "../models/migrationModels/migrationErrorTable.js";

/* RELATIONS */
import { organizationsRelations } from "../models/orgModels/orgRelations.js";
import { featureRelations } from "../models/featureModels/featureRelations.js";

// Customer Relations
import { customersRelations } from "../models/cusModels/cusRelations.js";
import { entitiesRelations } from "../models/cusModels/entityModels/entityRelations.js";

// Product Relations
import { entitlementsRelations } from "../models/productModels/entModels/entRelations.js";
import { priceRelations } from "../models/productModels/priceModels/priceRelations.js";
import { productRelations } from "../models/productModels/productRelations.js";
import { freeTrialRelations } from "../models/productModels/freeTrialModels/freeTrialRelations.js";

// CusProduct Relations
import { customerProductsRelations } from "../models/cusProductModels/cusProductRelations.js";
import { customerPricesRelations } from "../models/cusProductModels/cusPriceModels/cusPriceRelations.js";
import { customerEntitlementsRelations } from "../models/cusProductModels/cusEntModels/cusEntRelations.js";
import { apiKeyRelations } from "../models/devModels/apiKeyRelations.js";
import { replaceableRelations } from "../models/cusProductModels/cusEntModels/replaceableRelations.js";

// Reward Relations
import { rewardProgramRelations } from "../models/rewardModels/rewardProgramModels/rewardProgramRelations.js";
import { referralCodeRelations } from "../models/rewardModels/referralModels/referralCodeRelations.js";
import { rewardRedemptionRelations } from "../models/rewardModels/referralModels/rewardRedemptionRelations.js";

// Migration Relations
import { migrationErrorRelations } from "../models/migrationModels/migrationErrorRelations.js";

// Analytics Tables
import { actions } from "../models/analyticsModels/actionTable.js";
import { events } from "../models/eventModels/eventTable.js";
import { replaceables } from "../models/cusProductModels/cusEntModels/replaceableTable.js";

import {
  user,
  session,
  account,
  verification,
  member,
  invitation,
} from "./auth-schema.js";
import { userRelations } from "./auth-relations.js";

export {
  // Tables
  organizations,
  chatResults,
  freeTrials,
  entitlements,
  prices,
  features,
  products,
  customerProducts,
  customerPrices,
  customerEntitlements,
  invoices,
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

  // Auth
  user,
  session,
  account,
  verification,
  member,
  invitation,

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

  // Auth Relations
  userRelations,
};

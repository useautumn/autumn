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

const relations = {
  organizationsRelations,
  entitlementsRelations,
  featureRelations,
  priceRelations,
  productRelations,
  freeTrialRelations,
  customerProductsRelations,
  customerPricesRelations,
  customerEntitlementsRelations,

  // Customer Relations
  customersRelations,
  entitiesRelations,
  apiKeyRelations,
};

export const schemas = {
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

  // Customer
  customers,
  entities,

  // Other Tables
  apiKeys,
  metadata,
  subscriptions,

  ...relations,
};

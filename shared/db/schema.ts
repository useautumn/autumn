/* TABLES */
import { organizations } from "../models/orgModels/orgTable.js";
import { chatResults } from "../models/chatResultModels/chatResultTable.js";
import { features } from "../models/featureModels/featureTable.js";

// Product Tables
import { products } from "../models/productModels/productTable.js";
import { prices } from "../models/productModels/priceModels/priceTable.js";
import { entitlements } from "../models/productModels/entModels/entTable.js";

// Others
import { apiKeys } from "./apiKeysTable.js";
import { customers } from "./cusTable.js";

/* RELATIONS */
import { organizationsRelations } from "../models/orgModels/orgRelations.js";
import { apiKeysRelations } from "./relations.js";
import { featureRelations } from "../models/featureModels/featureRelations.js";

// Product Relations
import { entitlementsRelations } from "../models/productModels/entModels/entRelations.js";
import { priceRelations } from "../models/productModels/priceModels/priceRelations.js";
import { productRelations } from "../models/productModels/productRelations.js";

const relations = {
  organizationsRelations,
  apiKeysRelations,
  entitlementsRelations,
  featureRelations,
  priceRelations,
  productRelations,
};

export const schemas = {
  apiKeys,
  organizations,
  chatResults,
  entitlements,
  features,
  products,
  prices,
  customers,
  ...relations,
};

export {
  apiKeys,
  organizations,
  customers,
  chatResults,
  prices,
  entitlements,
  features,
  products,
};

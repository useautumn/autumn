import { organizations } from "../models/orgModels/orgTable.js";
import { chatResults } from "../models/chatResultModels/chatResultTable.js";
import { entitlements } from "../models/productModels/entModels/entTable.js";
import { features } from "../models/featureModels/featureTable.js";

import { apiKeys } from "./apiKeysTable.js";
import { customers } from "./cusTable.js";
import { prices } from "./pricesTable.js";
import { products } from "./productsTable.js";

// import * as relations from "./relations.js";

// Relations
import { organizationsRelations } from "../models/orgModels/orgRelations.js";
import { apiKeysRelations } from "./relations.js";
import { entitlementsRelations } from "../models/productModels/entModels/entRelations.js";
import { featureRelations } from "../models/featureModels/featureRelations.js";

const relations = {
  organizationsRelations,
  apiKeysRelations,
  entitlementsRelations,
  featureRelations,
};

export const schemas = {
  apiKeys,
  customers,
  chatResults,
  prices,
  organizations,
  entitlements,
  features,
  products,
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

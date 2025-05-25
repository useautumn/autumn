import { relations } from "drizzle-orm";

import { entitlements } from "../../productModels/entModels/entTable.js";
import { customers } from "../../cusModels/cusTable.js";
import { features } from "../../featureModels/featureTable.js";
import { customerEntitlements } from "./cusEntTable.js";
import { customerProducts } from "../cusProductTable.js";

export const customerEntitlementsRelations = relations(
  customerEntitlements,
  ({ one, many }) => ({
    customerProduct: one(customerProducts, {
      fields: [customerEntitlements.customer_product_id],
      references: [customerProducts.id],
    }),
    customer: one(customers, {
      fields: [customerEntitlements.internal_customer_id],
      references: [customers.internal_id],
    }),
    entitlement: one(entitlements, {
      fields: [customerEntitlements.entitlement_id],
      references: [entitlements.id],
    }),
    feature: one(features, {
      fields: [customerEntitlements.internal_feature_id],
      references: [features.internal_id],
    }),
  }),
);

import { relations } from "drizzle-orm";
import { customerProducts } from "./cusProductTable.js";
import { customers } from "../cusModels/cusTable.js";
import { products } from "../productModels/productTable.js";
import { freeTrials } from "../productModels/freeTrialModels/freeTrialTable.js";
import { customerEntitlements } from "./cusEntModels/cusEntTable.js";

export const customerProductsRelations = relations(
  customerProducts,
  ({ one, many }) => ({
    customer: one(customers, {
      fields: [customerProducts.internal_customer_id],
      references: [customers.internal_id],
    }),
    product: one(products, {
      fields: [customerProducts.internal_product_id],
      references: [products.internal_id],
    }),
    free_trial: one(freeTrials, {
      fields: [customerProducts.free_trial_id],
      references: [freeTrials.id],
    }),
    customer_entitlements: many(customerEntitlements),
  }),
);

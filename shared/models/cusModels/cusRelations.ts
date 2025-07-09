import { relations } from "drizzle-orm";
import { customers } from "./cusTable.js";
import { customerProducts } from "../cusProductModels/cusProductTable.js";
import { entities } from "./entityModels/entityTable.js";
import { organizations } from "../orgModels/orgTable.js";

export const customersRelations = relations(customers, ({ one, many }) => ({
  customer_products: many(customerProducts),
  entities: many(entities),
  org: one(organizations, {
    fields: [customers.org_id],
    references: [organizations.id],
  }),
}));

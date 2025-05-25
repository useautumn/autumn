import { relations } from "drizzle-orm";
import { customers } from "./cusTable.js";
import { customerPrices } from "../cusProductModels/cusPriceModels/cusPriceTable.js";
import { customerProducts } from "../cusProductModels/cusProductTable.js";
import { customerEntitlements } from "../cusProductModels/cusEntModels/cusEntTable.js";
import { entities } from "./entityModels/entityTable.js";

export const customersRelations = relations(customers, ({ one, many }) => ({
  customerProducts: many(customerProducts),
  customerPrices: many(customerPrices),
  customerEntitlements: many(customerEntitlements),

  entities: many(entities),
}));

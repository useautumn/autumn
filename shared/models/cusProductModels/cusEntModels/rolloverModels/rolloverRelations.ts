import { relations } from "drizzle-orm";
import { rollovers } from "./rolloverTable.js";
import { customerEntitlements } from "../cusEntTable.js";

export const rolloverRelations = relations(rollovers, ({ one }) => ({
  customer_entitlement: one(customerEntitlements, {
    fields: [rollovers.cus_ent_id],
    references: [customerEntitlements.id],
  }),
}));

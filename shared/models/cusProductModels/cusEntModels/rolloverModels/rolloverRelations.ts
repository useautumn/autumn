import { relations } from "drizzle-orm";
import { customerEntitlements } from "../cusEntTable.js";
import { rollovers } from "./rolloverTable.js";

export const rolloverRelations = relations(rollovers, ({ one }) => ({
	customer_entitlement: one(customerEntitlements, {
		fields: [rollovers.cus_ent_id],
		references: [customerEntitlements.id],
	}),
}));

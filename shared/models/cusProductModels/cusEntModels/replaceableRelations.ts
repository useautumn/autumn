import { relations } from "drizzle-orm";
import { replaceables } from "./replaceableTable.js";
import { customerEntitlements } from "./cusEntTable.js";

export const replaceableRelations = relations(replaceables, ({ one }) => ({
	customer_entitlement: one(customerEntitlements, {
		fields: [replaceables.cus_ent_id],
		references: [customerEntitlements.id],
	}),
}));

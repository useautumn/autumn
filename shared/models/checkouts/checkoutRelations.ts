import { relations } from "drizzle-orm";
import { customers } from "../cusModels/cusTable.js";
import { organizations } from "../orgModels/orgTable.js";
import { checkouts } from "./checkoutTable.js";

export const checkoutsRelations = relations(checkouts, ({ one }) => ({
	org: one(organizations, {
		fields: [checkouts.org_id],
		references: [organizations.id],
	}),
	customer: one(customers, {
		fields: [checkouts.internal_customer_id],
		references: [customers.internal_id],
	}),
}));

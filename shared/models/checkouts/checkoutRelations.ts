import { relations } from "drizzle-orm";
import { customers } from "../cusModels/cusTable";
import { organizations } from "../orgModels/orgTable";
import { checkouts } from "./checkoutTable";

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

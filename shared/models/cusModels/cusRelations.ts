import { relations } from "drizzle-orm";
import { customerProducts } from "../cusProductModels/cusProductTable.js";
import { organizations } from "../orgModels/orgTable.js";
import { customers } from "./cusTable.js";
import { entities } from "./entityModels/entityTable.js";

export const customersRelations = relations(customers, ({ one, many }) => ({
	customer_products: many(customerProducts),
	entities: many(entities),
	org: one(organizations, {
		fields: [customers.org_id],
		references: [organizations.id],
	}),
}));

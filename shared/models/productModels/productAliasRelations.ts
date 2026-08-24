import { relations } from "drizzle-orm";
import { organizations } from "../orgModels/orgTable";
import { productAliases } from "./productAliasTable";

export const productAliasRelations = relations(productAliases, ({ one }) => ({
	org: one(organizations, {
		fields: [productAliases.org_id],
		references: [organizations.id],
	}),
}));

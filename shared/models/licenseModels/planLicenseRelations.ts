import { relations } from "drizzle-orm";
import { products } from "../productModels/productTable";
import { planLicenses } from "./planLicenseTable";

export const planLicenseRelations = relations(planLicenses, ({ one }) => ({
	parentProduct: one(products, {
		fields: [planLicenses.parent_internal_product_id],
		references: [products.internal_id],
		relationName: "parentProductLicenses",
	}),
	product: one(products, {
		fields: [planLicenses.license_internal_product_id],
		references: [products.internal_id],
		relationName: "licenseProduct",
	}),
}));

import { relations } from "drizzle-orm";
import { entitlements } from "../productModels/entModels/entTable";
import { prices } from "../productModels/priceModels/priceTable";
import { products } from "../productModels/productTable";
import {
	licenseEntitlements,
	licensePrices,
	planLicenses,
} from "./planLicenseTable";

export const planLicenseRelations = relations(
	planLicenses,
	({ many, one }) => ({
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
		entitlementRefs: many(licenseEntitlements),
		priceRefs: many(licensePrices),
	}),
);

export const licenseEntitlementRelations = relations(
	licenseEntitlements,
	({ one }) => ({
		planLicense: one(planLicenses, {
			fields: [licenseEntitlements.plan_license_id],
			references: [planLicenses.id],
		}),
		entitlement: one(entitlements, {
			fields: [licenseEntitlements.entitlement_id],
			references: [entitlements.id],
		}),
	}),
);

export const licensePriceRelations = relations(licensePrices, ({ one }) => ({
	planLicense: one(planLicenses, {
		fields: [licensePrices.plan_license_id],
		references: [planLicenses.id],
	}),
	price: one(prices, {
		fields: [licensePrices.price_id],
		references: [prices.id],
	}),
}));

import { relations } from "drizzle-orm";
import { customers } from "../cusModels/cusTable.js";
import { freeTrials } from "../productModels/freeTrialModels/freeTrialTable.js";
import { products } from "../productModels/productTable.js";
import { customerEntitlements } from "./cusEntModels/cusEntTable.js";
import { customerPrices } from "./cusPriceModels/cusPriceTable.js";
import { customerProducts } from "./cusProductTable.js";

export const customerProductsRelations = relations(
	customerProducts,
	({ one, many }) => ({
		customer: one(customers, {
			fields: [customerProducts.internal_customer_id],
			references: [customers.internal_id],
		}),
		product: one(products, {
			fields: [customerProducts.internal_product_id],
			references: [products.internal_id],
		}),
		free_trial: one(freeTrials, {
			fields: [customerProducts.free_trial_id],
			references: [freeTrials.id],
		}),
		customer_entitlements: many(customerEntitlements),
		customer_prices: many(customerPrices),
	}),
);

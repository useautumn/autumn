import { relations } from "drizzle-orm";

import { customers } from "../../cusModels/cusTable.js";
import { prices } from "../../productModels/priceModels/priceTable.js";
import { customerProducts } from "../cusProductTable.js";
import { customerPrices } from "./cusPriceTable.js";

export const customerPricesRelations = relations(
	customerPrices,
	({ one, many }) => ({
		customerProduct: one(customerProducts, {
			fields: [customerPrices.customer_product_id],
			references: [customerProducts.id],
		}),
		customer: one(customers, {
			fields: [customerPrices.internal_customer_id],
			references: [customers.internal_id],
		}),
		price: one(prices, {
			fields: [customerPrices.price_id],
			references: [prices.id],
		}),
	}),
);

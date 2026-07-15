import type { Price } from "../productModels/priceModels/priceModels.js";

/**
 * A billable (price, quantity) pair resolved from customer state — the
 * scope-agnostic contract for SQL-constructed billing. Each scope (licenses
 * today; base prices, entity products, usage later) resolves its own math
 * and emits flat rows.
 */
export type LicenseBillingPriceRow = {
	// The customer product whose subscription / phase bucket this bills under.
	customerProductId: string;
	price: Price;
	quantity: number;
	source: {
		type: "customer_license_seat" | "customer_license_unused_prepaid";
		customerLicenseId: string;
	};
};

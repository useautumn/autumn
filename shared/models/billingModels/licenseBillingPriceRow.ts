import type { Price } from "../productModels/priceModels/priceModels.js";

export type LicenseBillingPriceRow = {
	customerProductId: string;
	price: Price;
	quantity: number;
	source: {
		type: "customer_license_seat" | "customer_license_unused_prepaid";
		customerLicenseId: string;
		planLicenseId?: string;
	};
};

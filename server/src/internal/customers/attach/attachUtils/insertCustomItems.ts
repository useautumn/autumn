import type { Entitlement, Price } from "@autumn/shared";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { EntitlementService } from "@/internal/products/entitlements/EntitlementService.js";
import { PriceService } from "@/internal/products/prices/PriceService.js";

export const insertCustomItems = async ({
	db,
	customPrices,
	customEnts,
}: {
	db: DrizzleCli;
	customPrices: Price[];
	customEnts: Entitlement[];
}) => {
	await EntitlementService.insert({
		db,
		data: customEnts,
	});

	await PriceService.insert({
		db,
		data: customPrices,
	});
};

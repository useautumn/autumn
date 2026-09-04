/**
 * Leftover catalog prices and entitlements are retired together, never deleted.
 *
 * Red (current): leftover rows call deleteInIds (breaks deferred checkout FKs)
 * Green (after): both leftover prices and ents go to retireInIds
 */

import { afterEach, expect, mock, spyOn, test } from "bun:test";
import type { Entitlement, Price, Product } from "@autumn/shared";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import type { Logger } from "@/external/logtail/logtailUtils.js";
import { EntitlementService } from "@/internal/products/entitlements/EntitlementService.js";
import { PriceService } from "@/internal/products/prices/PriceService.js";
import { handleNewProductItems } from "@/internal/products/product-items/productItemUtils/handleNewProductItems.js";

afterEach(() => {
	mock.restore();
});

test("handleNewProductItems retires leftover prices and entitlements and never deletes", async () => {
	const retirePrices = spyOn(PriceService, "retireInIds").mockResolvedValue(
		undefined,
	);
	const retireEnts = spyOn(EntitlementService, "retireInIds").mockResolvedValue(
		undefined,
	);
	const deletePrices = spyOn(PriceService, "deleteInIds").mockResolvedValue(
		undefined,
	);
	const deleteEnts = spyOn(EntitlementService, "deleteInIds").mockResolvedValue(
		undefined,
	);

	await handleNewProductItems({
		db: {} as DrizzleCli,
		curPrices: [{ id: "pr_old" } as Price],
		curEnts: [{ id: "ent_old" } as Entitlement],
		newItems: [],
		features: [],
		product: {
			org_id: "org_test",
			internal_id: "prod_test",
			env: "sandbox",
		} as Product,
		logger: { info() {}, error() {}, warn() {} } as Logger,
		isCustom: false,
		saveToDb: true,
		multiCurrencyEnabled: false,
	});

	expect(retirePrices).toHaveBeenCalledWith({
		db: {},
		ids: ["pr_old"],
	});
	expect(retireEnts).toHaveBeenCalledWith({
		db: {},
		ids: ["ent_old"],
	});
	expect(deletePrices).not.toHaveBeenCalled();
	expect(deleteEnts).not.toHaveBeenCalled();
});

/**
 * Catalog leftover rows are retired (is_custom), never hard-deleted.
 *
 * Red (current):  plan.prices.deleted / entitlements.deleted call deleteInIds
 * Green (after):  both buckets go to retireInIds; deleteInIds is not called
 */

import { afterEach, expect, mock, spyOn, test } from "bun:test";
import type { Entitlement, Price } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { applyEntitlementPricesPlan } from "@/internal/catalogV2/execute/executeUpsertProducts/applyEntitlementPricesPlan.js";
import { emptyEntitlementPricesPlan } from "@/internal/products/actions/computeEntitlementPricesPlan/types/entitlementPricesPlan.js";
import { EntitlementService } from "@/internal/products/entitlements/EntitlementService.js";
import { PriceService } from "@/internal/products/prices/PriceService.js";

afterEach(() => {
	mock.restore();
});

test("applyEntitlementPricesPlan retires leftover catalog rows and never deletes", async () => {
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

	const plan = emptyEntitlementPricesPlan();
	plan.prices.deleted = [{ id: "pr_deleted" } as Price];
	plan.prices.retired = [{ id: "pr_retired" } as Price];
	plan.entitlements.deleted = [{ id: "ent_deleted" } as Entitlement];
	plan.entitlements.retired = [{ id: "ent_retired" } as Entitlement];

	await applyEntitlementPricesPlan({
		ctx: { db: {} } as AutumnContext,
		upsert: { entitlementPricesPlan: plan } as never,
	});

	expect(retirePrices).toHaveBeenCalledWith({
		db: {},
		ids: ["pr_retired", "pr_deleted"],
	});
	expect(retireEnts).toHaveBeenCalledWith({
		db: {},
		ids: ["ent_retired", "ent_deleted"],
	});
	expect(deletePrices).not.toHaveBeenCalled();
	expect(deleteEnts).not.toHaveBeenCalled();
});

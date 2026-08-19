import type { DrizzleCli } from "@/db/initDrizzle.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import type {
	PlanLicensePlan,
	UpsertProductPlan,
} from "@/internal/catalogV2/actions/updateCatalog/types/upsertProductPlan";
import { licenseItemRepo } from "@/internal/licenses/repos/licenseItemRepo.js";
import { planLicenseRepo } from "@/internal/licenses/repos/planLicenseRepo.js";
import { EntitlementService } from "@/internal/products/entitlements/EntitlementService.js";
import { PriceService } from "@/internal/products/prices/PriceService.js";

/** Replays one link's pre-decided writes: retire → row → junction → delete. */
const executePlanLicenseRowPlan = async ({
	db,
	planLicense,
}: {
	db: DrizzleCli;
	planLicense: PlanLicensePlan;
}) => {
	const rowPlan = planLicense.rowPlan;
	if (!rowPlan) return;

	// Overlay is_custom rows must exist before junctions reference them.
	const overlay = planLicense.entitlementPricesPlan;
	if (overlay) {
		if (overlay.entitlements.new.length > 0) {
			await EntitlementService.insert({ db, data: overlay.entitlements.new });
		}
		if (overlay.prices.new.length > 0) {
			await PriceService.insert({ db, data: overlay.prices.new });
		}
	}

	if (rowPlan.retirePlanLicenseId) {
		await planLicenseRepo.retireCatalogById({
			db,
			id: rowPlan.retirePlanLicenseId,
		});
	}

	if (rowPlan.row) {
		await planLicenseRepo.upsertById({ db, ...rowPlan.row });
	}

	if (rowPlan.junction) {
		await licenseItemRepo.setItems({ db, ...rowPlan.junction });
	}

	if (rowPlan.deletePlanLicenseId) {
		await planLicenseRepo.deleteByIds({
			db,
			ids: [rowPlan.deletePlanLicenseId],
		});
	}
};

/** Persist the planned plan_license set — pure replay of compute's row plans. */
export const executePlanLicensesPlan = async ({
	ctx,
	upsert,
}: {
	ctx: AutumnContext;
	upsert: UpsertProductPlan;
}) => {
	const planLicenses = upsert.planLicenses;
	if (!planLicenses || planLicenses.length === 0) return;

	await ctx.db.transaction(async (tx) => {
		const db = tx as unknown as DrizzleCli;
		for (const planLicense of planLicenses) {
			await executePlanLicenseRowPlan({ db, planLicense });
		}
	});
};

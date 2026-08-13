import type { AutumnContext } from "@/honoUtils/HonoEnv";
import type { UpsertProductPlan } from "@/internal/catalogV2/actions/updateCatalog/types/upsertProductPlan";
import { EntitlementService } from "@/internal/products/entitlements/EntitlementService.js";
import { PriceService } from "@/internal/products/prices/PriceService.js";

export const applyEntitlementPricesPlan = async ({
	ctx,
	upsert,
}: {
	ctx: AutumnContext;
	upsert: UpsertProductPlan;
}) => {
	const plan = upsert.entitlementPricesPlan;
	if (!plan) return;

	if (plan.entitlements.new.length > 0) {
		await EntitlementService.insert({
			db: ctx.db,
			data: plan.entitlements.new,
		});
	}
	if (plan.prices.new.length > 0) {
		await PriceService.insert({
			db: ctx.db,
			data: plan.prices.new,
		});
	}

	if (plan.entitlements.updated.length > 0) {
		await EntitlementService.upsert({
			db: ctx.db,
			data: plan.entitlements.updated,
		});
	}
	if (plan.prices.updated.length > 0) {
		await PriceService.upsert({
			db: ctx.db,
			data: plan.prices.updated,
		});
	}

	if (plan.prices.deleted.length > 0) {
		await PriceService.deleteInIds({
			db: ctx.db,
			ids: plan.prices.deleted.map((price) => price.id),
		});
	}
	if (plan.entitlements.deleted.length > 0) {
		await EntitlementService.deleteInIds({
			db: ctx.db,
			ids: plan.entitlements.deleted.map((entitlement) => entitlement.id),
		});
	}
};

import type { CatalogAction } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import type { UpdateCatalogPlan } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogPlan";
import type { UpsertProductPlan } from "@/internal/catalogV2/actions/updateCatalog/types/upsertProductPlan";
import type { CatalogAppliedResult } from "@/internal/catalogV2/execute/executeUpdateCatalogPlan";
import { EntitlementService } from "@/internal/products/entitlements/EntitlementService.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { PriceService } from "@/internal/products/prices/PriceService.js";

const applyEntitlementPricesPlan = async ({
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

const applyProductDetailsUpdate = async ({
	ctx,
	upsert,
}: {
	ctx: AutumnContext;
	upsert: UpsertProductPlan;
}) => {
	const details = upsert.details;
	if (!details || upsert.row.op !== "update") return;

	const { product } = details;
	await ProductService.updateByInternalId({
		db: ctx.db,
		internalId: product.internal_id,
		update: {
			id: product.id,
			name: product.name,
			description: product.description,
			group: product.group,
			is_add_on: product.is_add_on,
			is_default: product.is_default,
			archived: product.archived,
			config: product.config,
			metadata: product.metadata,
		},
	});
};

const executeUpsertProduct = async ({
	ctx,
	upsert,
}: {
	ctx: AutumnContext;
	upsert: UpsertProductPlan;
}) => {
	if (upsert.row.op === "create") {
		const product = upsert.details?.product ?? upsert.row.nextFullProduct;
		await ProductService.insert({ db: ctx.db, product });
	}

	await applyEntitlementPricesPlan({ ctx, upsert });
	await applyProductDetailsUpdate({ ctx, upsert });
};

const upsertOpToAction = ({
	op,
}: {
	op: UpsertProductPlan["row"]["op"];
}): CatalogAction => {
	if (op === "create") return "create";
	if (op === "update") return "update";
	return "none";
};

/** Persist upsertProducts — product row + entitlement-price buckets. */
export const executeUpsertProducts = async ({
	ctx,
	updateCatalogPlan,
}: {
	ctx: AutumnContext;
	updateCatalogPlan: UpdateCatalogPlan;
}): Promise<CatalogAppliedResult[]> => {
	const results: CatalogAppliedResult[] = [];

	for (const upsert of updateCatalogPlan.upsertProducts) {
		await executeUpsertProduct({ ctx, upsert });
		results.push({
			id: upsert.row.planId,
			action: upsertOpToAction({ op: upsert.row.op }),
		});
	}

	return results;
};

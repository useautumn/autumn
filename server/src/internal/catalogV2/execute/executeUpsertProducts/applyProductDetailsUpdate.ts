import type { AutumnContext } from "@/honoUtils/HonoEnv";
import type { UpsertProductPlan } from "@/internal/catalogV2/actions/updateCatalog/types/upsertProductPlan";
import { ProductService } from "@/internal/products/ProductService.js";

export const applyProductDetailsUpdate = async ({
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
			auto_topups: product.auto_topups,
			spend_limits: product.spend_limits,
			usage_limits: product.usage_limits,
			usage_alerts: product.usage_alerts,
			overage_allowed: product.overage_allowed,
		},
	});
};

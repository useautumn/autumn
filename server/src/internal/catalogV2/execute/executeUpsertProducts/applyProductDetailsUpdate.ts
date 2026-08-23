import type { AutumnContext } from "@/honoUtils/HonoEnv";
import type { UpsertProductPlan } from "@/internal/catalogV2/actions/updateCatalog/types/upsertProductPlan";
import { ProductService } from "@/internal/products/ProductService.js";
import { updateStripeProductNames } from "@/internal/products/stripeResourceUtils/updateStripeProductNames.js";

/** Rename syncs to Stripe only for bases — variants share the base's Stripe Product. */
const renamesOwnedStripeProduct = ({
	upsert,
}: {
	upsert: UpsertProductPlan;
}): boolean =>
	upsert.details?.previousAttributes?.name !== undefined &&
	!upsert.row.currentFullProduct?.base_internal_product_id;

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
			version_slug: product.version_slug,
			config: product.config,
			metadata: product.metadata,
			auto_topups: product.auto_topups,
			spend_limits: product.spend_limits,
			usage_limits: product.usage_limits,
			usage_alerts: product.usage_alerts,
			overage_allowed: product.overage_allowed,
			base_internal_product_id: product.base_internal_product_id,
		},
	});

	if (renamesOwnedStripeProduct({ upsert })) {
		await updateStripeProductNames({
			org: ctx.org,
			curProduct: upsert.row.currentFullProduct!,
			newName: product.name,
			logger: ctx.logger,
		});
	}
};

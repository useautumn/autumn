import { type CatalogUpdateMappingsParams, ProcessorType } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { ProductService } from "@/internal/products/ProductService.js";
import type { ContextsByPlanId } from "./loadMappingContexts.js";
import {
	type PriceTargets,
	normalizeStripeProductId,
	setPriceTarget,
} from "./updateMappingUtils.js";

export const applyPlanMappings = async ({
	ctx,
	params,
	contextsByPlanId,
	priceTargets,
}: {
	ctx: AutumnContext;
	params: CatalogUpdateMappingsParams;
	contextsByPlanId: ContextsByPlanId;
	priceTargets: PriceTargets;
}) => {
	const { db } = ctx;

	for (const mapping of params.plan_mappings) {
		const stripeProductId = normalizeStripeProductId(mapping.stripe_product_id);
		const contexts = contextsByPlanId.get(mapping.plan_id) ?? [];

		for (const context of contexts) {
			const existingProcessorId =
				context.product.processor?.type === ProcessorType.Stripe
					? context.product.processor.id
					: null;
			const processorChanged = existingProcessorId !== stripeProductId;

			await ProductService.updateByInternalId({
				db,
				internalId: context.product.internal_id,
				update: {
					processor: stripeProductId
						? { id: stripeProductId, type: ProcessorType.Stripe }
						: null,
				},
			});

			if (mapping.scope === "none") continue;
			if (mapping.scope === "base_price" && context.basePrice?.id) {
				setPriceTarget({
					targets: priceTargets,
					price: context.basePrice,
					priceId: context.basePrice.id,
					stripeProductId,
					source: "plan",
					resetStripeResources: processorChanged,
					matchExistingStripePrice: true,
				});
			}
		}
	}
};

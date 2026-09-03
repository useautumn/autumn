import { ApiPriceProcessorsSchema } from "@api/products/components/processors.js";
import {
	PLAN_ITEM_PRICE_DESCRIPTION,
	PlanItemParamsObjectSchema,
	PlanItemPriceParamsSchema,
	planItemParamsIssues,
} from "@api/products/items/crud/createPlanItemParamsV1.js";
import type { z } from "zod/v4";

/**
 * The plan item schema plus Stripe price adoption. Adoption is scoped to the
 * catalog path: `validateAdoptedStripePrices` only runs in the catalogV2 init
 * flow, so a stated price id on attach/customize/migration would be persisted
 * unchecked and only surface as a Stripe error at checkout. Keep `processors`
 * here rather than on `CreatePlanItemParamsV1Schema`.
 */
export const CatalogPlanItemPriceParamsSchema =
	PlanItemPriceParamsSchema.extend({
		processors: ApiPriceProcessorsSchema.optional().meta({
			description:
				"Adopt an existing Stripe price instead of creating one. The id must already exist in Stripe.",
		}),
	});

export const CatalogPlanItemParamsV1Schema = PlanItemParamsObjectSchema.extend({
	price: CatalogPlanItemPriceParamsSchema.optional().meta({
		description: PLAN_ITEM_PRICE_DESCRIPTION,
	}),
})
	.check((ctx) => {
		for (const { message, input } of planItemParamsIssues(ctx.value)) {
			ctx.issues.push({ code: "custom", message, input });
		}
	})
	.meta({
		title: "CatalogPlanItem",
		description:
			"Configuration for a feature item in a catalog plan, including usage limits, pricing, rollover settings and Stripe price adoption.",
	});

export type CatalogPlanItemParamsV1 = z.infer<
	typeof CatalogPlanItemParamsV1Schema
>;
export type CatalogPlanItemParamsV1Input = z.input<
	typeof CatalogPlanItemParamsV1Schema
>;

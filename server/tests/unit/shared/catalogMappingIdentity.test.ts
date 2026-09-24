import { describe, expect, test } from "bun:test";
import { GetCatalogResponseSchema } from "@autumn/shared/api/catalogV2/getCatalogResponse.js";
import {
	catalogPlanItemIdentity,
	evaluateCatalogItemIdentity,
} from "@autumn/shared/api/catalogV2/planUpdate/params/catalogPlanItemIdentity.js";
import { CatalogPlanItemParamsV1Schema } from "@autumn/shared/api/catalogV2/planUpdate/params/catalogPlanItemParams.js";
import {
	CatalogVariantParamsSchema,
	catalogVariantIdentity,
} from "@autumn/shared/api/catalogV2/planUpdate/params/catalogVariantParams.js";
import { ApiPlanProcessorsSchema } from "@autumn/shared/api/products/components/processors.js";
import { ApiPlanItemV1Schema } from "@autumn/shared/api/products/items/apiPlanItemV1.js";
import {
	buildPlanItemKey,
	PlanItemMatchPrecision,
} from "@autumn/shared/utils/planV1Utils/diff/diffPlanV1.js";
import { z } from "zod/v4";
import { removeInternalFields } from "../../../../packages/openapi/utils/openapiTransform/removeInternalFields.js";

describe("catalog mapping identities", () => {
	test("strips mapping identity from public schemas", () => {
		const plan = GetCatalogResponseSchema.shape.plans.element;
		const item = plan.shape.items.element;
		expect(
			item
				.pick({ mapping_identity: true })
				.parse({ mapping_identity: '["messages","","",""]' }),
		).toEqual({ mapping_identity: '["messages","","",""]' });
		const publicItem = z.toJSONSchema(ApiPlanItemV1Schema, { io: "input" });
		removeInternalFields({ openApiDocument: publicItem });
		expect(publicItem.properties).not.toHaveProperty("mapping_identity");
		const variant = plan.shape.variants.unwrap().element;
		expect(variant.shape.mapping_identity.parse('["regional"]')).toBe(
			'["regional"]',
		);
		const publicVariant = z.toJSONSchema(variant, { io: "input" });
		removeInternalFields({ openApiDocument: publicVariant });
		expect(publicVariant.properties).not.toHaveProperty("mapping_identity");
	});

	test("preserves legacy cadence keys and conditional defaults", () => {
		const cases = [
			{ item: { feature_id: "messages" }, values: ["messages", "", "", ""] },
			{
				item: { feature_id: "messages", reset: { interval: "month" } },
				values: ["messages", "", "month", 1],
			},
			{
				item: {
					feature_id: "messages",
					price: {
						billing_method: "usage_based",
						interval: "year",
						interval_count: 2,
					},
					reset: { interval: "month", interval_count: 3 },
				},
				values: ["messages", "usage_based", "year", 2],
			},
			{
				item: {
					feature_id: "messages",
					price: { interval: null, interval_count: null },
					reset: { interval: "month", interval_count: 3 },
				},
				values: ["messages", "", "month", 3],
			},
			{
				item: { feature_id: "messages", price: { interval_count: 0 } },
				values: ["messages", "", "", 0],
			},
		];
		for (const { item, values } of cases) {
			expect(evaluateCatalogItemIdentity({ item })).toEqual(values);
			expect(buildPlanItemKey({ item })).toBe(values.join("|"));
			expect(
				buildPlanItemKey({
					item,
					matchPrecision: PlanItemMatchPrecision.FeatureCadence,
				}),
			).toBe([values[0], ...values.slice(2)].join("|"));
		}
	});

	test("JSON tuples avoid delimiter collisions", () => {
		const first = evaluateCatalogItemIdentity({ item: { feature_id: "a|b" } });
		const second = evaluateCatalogItemIdentity({
			item: { feature_id: "a", price: { billing_method: "b|" } },
		});
		expect(JSON.stringify(first)).not.toBe(JSON.stringify(second));
	});

	test("publishes the executable recipe and mapping discovery metadata", () => {
		expect(
			z.toJSONSchema(CatalogPlanItemParamsV1Schema, { io: "input" })[
				"x-atmn-identity"
			],
		).toEqual(catalogPlanItemIdentity);
		expect(
			z.toJSONSchema(CatalogVariantParamsSchema, { io: "input" })[
				"x-atmn-identity"
			],
		).toEqual(catalogVariantIdentity);
		expect(z.toJSONSchema(ApiPlanProcessorsSchema)["x-atmn-mapping"]).toBe(
			true,
		);
		expect(
			CatalogVariantParamsSchema.shape.processors.meta()?.[
				"x-atmn-source-path"
			],
		).toBe("plan.processors");
		expect(
			evaluateCatalogItemIdentity({
				item: { variant_plan_id: "regional" },
				recipe: catalogVariantIdentity,
			}),
		).toEqual(["regional"]);
	});
});

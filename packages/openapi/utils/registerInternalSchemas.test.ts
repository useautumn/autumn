import { expect, test } from "bun:test";
import {
	JSON_SCHEMA_INPUT_REGISTRY,
	JSON_SCHEMA_OUTPUT_REGISTRY,
} from "@orpc/zod/zod4";
import { z } from "zod/v4";
import { CatalogPlanItemParamsV1Schema } from "../../../shared/api/catalogV2/planUpdate/params/catalogPlanItemParams.js";
import { CatalogVariantParamsSchema } from "../../../shared/api/catalogV2/planUpdate/params/catalogVariantParams.js";
import { registerInternalSchemas } from "./registerInternalSchemas.js";

test("mapping-only registration preserves historical internal field exposure", () => {
	const schema = z.string().meta({ internal: true, "x-atmn-mapping": true });
	registerInternalSchemas(schema, { mappingOnly: true });
	expect(Object.entries(JSON_SCHEMA_INPUT_REGISTRY.get(schema) ?? {})).toEqual([
		["x-atmn-mapping", true],
	]);
	expect(Object.entries(JSON_SCHEMA_OUTPUT_REGISTRY.get(schema) ?? {})).toEqual(
		[["x-atmn-mapping", true]],
	);
});

test("bridges catalog identity and mapping metadata into both OpenAPI registries", () => {
	registerInternalSchemas(CatalogPlanItemParamsV1Schema);
	registerInternalSchemas(CatalogVariantParamsSchema);
	for (const registry of [
		JSON_SCHEMA_INPUT_REGISTRY,
		JSON_SCHEMA_OUTPUT_REGISTRY,
	]) {
		expect(registry.get(CatalogPlanItemParamsV1Schema)).toMatchObject({
			"x-atmn-identity": { responseField: "mapping_identity" },
		});
		expect(
			registry.get(CatalogVariantParamsSchema.shape.processors),
		).toMatchObject({
			"x-atmn-source-path": "plan.processors",
			description:
				CatalogVariantParamsSchema.shape.processors.meta()?.description,
		});
		expect(
			registry.get(CatalogVariantParamsSchema.shape.processors.unwrap()),
		).toMatchObject({
			"x-atmn-mapping": true,
		});
	}
});

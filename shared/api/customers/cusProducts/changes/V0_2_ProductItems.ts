import { APICusProductSchema } from "@api/customers/components/apiCusProduct.js";
import { ApiVersion } from "@api/versionUtils/ApiVersion.js";
import {
	AffectedResource,
	VersionChange,
} from "@api/versionUtils/versionChangeUtils/VersionChange.js";
import type { z } from "zod/v4";

/**
 * V0_2: Customer products gained 'items' field
 *
 * V0_2+ format: Has items field with product features
 * V0_1 format: No items field, no current_period_end/start
 */

// V0_2+ product schema (with items)
const V0_2_CusProductSchema = APICusProductSchema;

// V0_1 product schema (without items and period fields)
const V0_1_CusProductSchema = APICusProductSchema.omit({
	items: true,
	current_period_end: true,
	current_period_start: true,
});

export class V0_2_ProductItems extends VersionChange<
	typeof V0_2_CusProductSchema,
	typeof V0_1_CusProductSchema
> {
	readonly version = ApiVersion.V0_2;
	readonly description = "Products gained 'items' field";
	readonly affectedResources = [AffectedResource.CusProduct];
	readonly affectsRequest = false;
	readonly affectsResponse = true;

	readonly newSchema = V0_2_CusProductSchema;
	readonly oldSchema = V0_1_CusProductSchema;

	transformResponse({
		input,
	}: {
		input: z.infer<typeof V0_2_CusProductSchema>;
	}): z.infer<typeof V0_1_CusProductSchema> {
		// Remove items and period fields for V0_1
		// biome-ignore lint/correctness/noUnusedVariables: Using destructuring to omit fields
		const { items, current_period_end, current_period_start, ...rest } = input;

		return rest;
	}
}

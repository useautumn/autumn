import { ApiVersion } from "@api/versionUtils/ApiVersion.js";
import {
	AffectedResource,
	defineVersionChange,
} from "@api/versionUtils/versionChangeUtils/VersionChange.js";
import type { z } from "zod/v4";
import { TrackParamsV0Schema } from "../prevVersions/trackParamsV0.js";
import { TrackParamsSchema } from "../trackParams.js";

/**
 * V1_2_TrackParamsChange: Transforms track request body TO latest format
 *
 * Applied when: sourceVersion <= V1.2
 *
 * Breaking changes introduced in V2.0 (that we transform here):
 *
 * 1. Value field location:
 *    - V1.2: `properties.value` (value passed inside properties object)
 *    - V2.0+: `value` (top-level field)
 *
 * This transformation extracts `properties.value` and maps it to the
 * top-level `value` field for V1.2 clients, ensuring they can continue
 * using the legacy format.
 *
 * Input: TrackParamsV0 (V1.2 format with properties.value)
 * Output: TrackParamsV1 (V2.0+ format with top-level value)
 */
export const V1_2_TrackParamsChange = defineVersionChange({
	name: "V1_2 Track Params Change",
	newVersion: ApiVersion.V2_0,
	oldVersion: ApiVersion.V1_Beta,
	description: [
		"Maps properties.value to top-level value field for V1.2 clients",
	],
	affectedResources: [AffectedResource.Track],
	newSchema: TrackParamsSchema,
	oldSchema: TrackParamsV0Schema,

	affectsRequest: true,
	affectsResponse: false,

	// Request: V1.2 → V2.0 (extract properties.value to value if not already set)
	transformRequest: ({
		input,
	}: {
		input: z.infer<typeof TrackParamsV0Schema>;
	}): z.infer<typeof TrackParamsSchema> => {
		// Keep original value if provided, otherwise extract from properties.value
		let value = input.value;
		let properties = input.properties;

		if (input.properties?.value !== undefined) {
			// Only use properties.value if top-level value is not set
			if (value === undefined) {
				const parsedValue = Number(input.properties.value);
				if (!Number.isNaN(parsedValue)) {
					value = parsedValue;
				}
			}

			// Always remove value from properties after processing
			const { value: _, ...restProperties } = input.properties;
			properties = Object.keys(restProperties).length > 0 ? restProperties : {};
		}

		return {
			...input,
			properties,
			value,
		};
	},
});

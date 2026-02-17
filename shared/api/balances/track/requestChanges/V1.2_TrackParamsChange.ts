import { ApiVersion } from "@api/versionUtils/ApiVersion.js";
import {
	AffectedResource,
	defineVersionChange,
} from "@api/versionUtils/versionChangeUtils/VersionChange.js";
import type { z } from "zod/v4";
import type { SharedContext } from "../../../../types/sharedContext.js";
import { TrackParamsSchema } from "../trackParams.js";

/**
 * V1_2_TrackParamsChange: Transforms track request body TO latest format
 *
 * Applied when: sourceVersion <= V1.2
 *
 * In V1.2, `value` could be passed via `properties.value` as a legacy pattern.
 * This transformation extracts `properties.value` and maps it to the top-level
 * `value` field (only if `value` is not already provided).
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
	oldSchema: TrackParamsSchema,

	affectsRequest: true,
	affectsResponse: false,

	// Request: V1.2 → V2.0 (extract properties.value to value if not already set)
	transformRequest: ({
		ctx: _ctx,
		input,
	}: {
		ctx: SharedContext;
		input: z.infer<typeof TrackParamsSchema>;
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

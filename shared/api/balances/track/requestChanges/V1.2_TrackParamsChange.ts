import { ApiVersion } from "@api/versionUtils/ApiVersion.js";
import {
	AffectedResource,
	defineVersionChange,
} from "@api/versionUtils/versionChangeUtils/VersionChange.js";
import type { z } from "zod/v4";
import type { SharedContext } from "../../../../types/sharedContext.js";
import { TrackParamsSchema } from "../trackParams.js";

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

	transformRequest: ({
		ctx: _ctx,
		input,
	}: {
		ctx: SharedContext;
		input: z.infer<typeof TrackParamsSchema>;
	}): z.infer<typeof TrackParamsSchema> => {
		let value = input.value;
		let properties = input.properties;

		if (input.properties?.value !== undefined) {
			if (value === undefined) {
				const parsedValue = Number(input.properties.value);
				if (!Number.isNaN(parsedValue)) {
					value = parsedValue;
				}
			}

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

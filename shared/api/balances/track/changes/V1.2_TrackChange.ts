import { ApiVersion } from "@api/versionUtils/ApiVersion.js";
import {
	AffectedResource,
	defineVersionChange,
} from "@api/versionUtils/versionChangeUtils/VersionChange.js";
import type { z } from "zod/v4";
import { TrackResponseV1Schema } from "../prevVersions/trackResponseV1.js";
import { TrackLegacyDataSchema } from "../trackLegacyData.js";
import { TrackResponseV2Schema } from "../trackResponseV2.js";

export const V1_2_TrackChange = defineVersionChange({
	name: "V1_2 Track Change",
	newVersion: ApiVersion.V2_0,
	oldVersion: ApiVersion.V1_Beta,
	description: ["Track response transformed to V1.2 format"],
	affectedResources: [AffectedResource.Track],
	newSchema: TrackResponseV2Schema,
	oldSchema: TrackResponseV1Schema,
	affectsResponse: true,
	legacyDataSchema: TrackLegacyDataSchema,

	transformResponse: ({
		input,
		legacyData,
	}: {
		input: z.infer<typeof TrackResponseV2Schema>;
		legacyData?: {
			feature_id?: string;
		};
	}): z.infer<typeof TrackResponseV1Schema> => {
		let feature_id: string | undefined;

		if (input.balance?.feature_id) {
			feature_id = input.balance.feature_id;
		} else if (input.balances) {
			for (const balance of Object.values(input.balances)) {
				if (balance?.feature_id) {
					feature_id = balance.feature_id;
					break;
				}
			}
		}

		feature_id = feature_id || legacyData?.feature_id;

		return {
			id: "placeholder",
			code: "event_received",
			customer_id: input.customer_id,
			entity_id: input.entity_id,
			event_name: input.event_name,
			feature_id,
		};
	},
});

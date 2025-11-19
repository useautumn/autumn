import { ApiVersion } from "@api/versionUtils/ApiVersion.js";
import {
	AffectedResource,
	defineVersionChange,
} from "@api/versionUtils/versionChangeUtils/VersionChange.js";
import type { z } from "zod/v4";
import { TrackResponseV1Schema } from "../prevVersions/trackResponseV1.js";
import { TrackLegacyDataSchema } from "../trackLegacyData.js";
import { TrackResponseV2Schema } from "../trackResponseV2.js";

/**
 * V1_2_TrackChange: Transforms track response TO V1_2 format
 *
 * Applied when: targetVersion <= V1_2
 *
 * Breaking changes introduced in V2.0 (that we reverse here):
 *
 * 1. Response structure:
 *    - V2.0+: Has `balance` and `balances` fields
 *    - V1.2: Has `id`, `code`, and `feature_id` fields
 *
 * 2. Removed fields in V2.0:
 *    - `id`: Event ID (now optional/removed)
 *    - `code`: Response code (now optional/removed)
 *    - `feature_id`: Feature ID (now derived from balance)
 *
 * Input: TrackResponseV2 (V2.0+ format)
 * Output: TrackResponseV1 (V1.2 format)
 */

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

	// Response: V2.0 → V1.2
	transformResponse: ({
		input,
		legacyData,
	}: {
		input: z.infer<typeof TrackResponseV2Schema>;
		legacyData?: {
			feature_id?: string;
		};
	}): z.infer<typeof TrackResponseV1Schema> => {
		// Extract feature_id from balance if available, otherwise from balances record, or use legacyData
		let feature_id: string | undefined;

		if (input.balance?.feature_id) {
			feature_id = input.balance.feature_id;
		} else if (input.balances) {
			// Get first feature_id from balances record
			const balanceKeys = Object.keys(input.balances);
			if (balanceKeys.length > 0) {
				feature_id = input.balances[balanceKeys[0]]?.feature_id;
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

import { ApiVersion } from "@api/versionUtils/ApiVersion.js";
import {
	AffectedResource,
	defineVersionChange,
} from "@api/versionUtils/versionChangeUtils/VersionChange.js";
import type { z } from "zod/v4";
import { EventsAggregateResponseV0Schema } from "../eventsAggregateResponseV0.js";
import {
	type EventsAggregateResponseV1,
	EventsAggregateResponseV1Schema,
} from "../eventsAggregateResponseV1.js";

/**
 * V2_0_AggregateEventsChange: Transforms events aggregate response from V1 (V2.1) to V0 (V2.0) format
 *
 * Applied when: targetVersion <= V2.0
 *
 * Changes:
 * - For flat: Flattens list items from { period, values } to { period, ...values }
 * - For grouped: Uses grouped_values instead of values for the V0 format
 */
export const V2_0_AggregateEventsChange = defineVersionChange({
	name: "V2_0 Aggregate Events Change",
	newVersion: ApiVersion.V2_1,
	oldVersion: ApiVersion.V2_0,
	description: [
		"Restructure list items from { period, values, grouped_values? } to flat object",
	],
	affectedResources: [AffectedResource.EventsAggregate],
	newSchema: EventsAggregateResponseV1Schema,
	oldSchema: EventsAggregateResponseV0Schema,
	affectsResponse: true,

	transformResponse: ({
		input,
	}: {
		input: EventsAggregateResponseV1;
	}): z.infer<typeof EventsAggregateResponseV0Schema> => {
		return {
			list: input.list.map((item) => ({
				period: item.period,
				...(item.grouped_values ?? item.values),
			})),
			total: input.total,
		};
	},
});

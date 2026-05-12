import { createPagePaginatedResponseSchema } from "@api/common/pagePaginationSchemas";
import { z } from "zod/v4";
import { TrackMutationSchema } from "../../balances/track/trackResponseV3";

export const EVENTS_LIST_EXAMPLE = {
	list: [
		{
			id: "evt_36xpk2TmuQX5zVPPQ8tCtnR5Weg",
			timestamp: 1765958215459,
			feature_id: "credits",
			customer_id: "0pCIbS4AMAFDB1iBMNhARWZt2gDtVwQx",
			value: 30,
			properties: {},
			mutations: [
				{
					balance_id: "cus_ent_3DdSDtFBlvDbjyUuJeUIbQlyN12",
					feature_id: "credits",
					value: 30,
				},
			],
		},
		{
			id: "evt_36xmHxxjAkqxufDf9yHAPNfRrLM",
			timestamp: 1765956512057,
			feature_id: "credits",
			customer_id: "0pCIbS4AMAFDB1iBMNhARWZt2gDtVwQx",
			value: 49,
			properties: {},
			mutations: null,
		},
	],
	total: 2,
	has_more: false,
	offset: 0,
	limit: 100,
};

export const ApiEventsListItemSchema = z.object({
	id: z.string().describe("Event ID (KSUID)"),
	timestamp: z.number().describe("Event timestamp (epoch milliseconds)"),

	feature_id: z
		.string()
		.describe("ID of the feature that the event belongs to"),

	customer_id: z.string().describe("Customer identifier"),
	value: z.number().describe("Event value/count"),
	properties: z
		.record(z.string(), z.unknown())
		.describe("Event properties (JSON)"),
	mutations: z
		.array(TrackMutationSchema)
		.nullable()
		.describe(
			"Per-balance breakdown of what this event consumed. Null for events ingested before mutations were tracked; an empty array means the event was accepted but no balance moved.",
		),
});

export const ApiEventsListResponseSchema = createPagePaginatedResponseSchema(
	ApiEventsListItemSchema,
);

export type ApiEventsListItem = z.infer<typeof ApiEventsListItemSchema>;
export type ApiEventsListResponse = z.infer<typeof ApiEventsListResponseSchema>;

import type { z } from "zod/v4";
import { createCursorPaginatedResponseSchema } from "../../common/cursorPaginationSchemas.js";
import { ApiEventsListItemSchema } from "./eventsListResponse.js";

export const ApiEventsListV2_3ResponseSchema =
	createCursorPaginatedResponseSchema(ApiEventsListItemSchema);

export const EVENTS_LIST_V2_3_EXAMPLE = {
	list: [
		{
			id: "evt_36xpk2TmuQX5zVPPQ8tCtnR5Weg",
			timestamp: 1765958215459,
			feature_id: "credits",
			customer_id: "0pCIbS4AMAFDB1iBMNhARWZt2gDtVwQx",
			value: 30,
			properties: {},
			deductions: [
				{
					balance_id: "cus_ent_3DdSDtFBlvDbjyUuJeUIbQlyN12",
					feature_id: "credits",
					plan_id: "pro",
					reset: {
						interval: "month" as const,
						resets_at: 1765958215459,
					},
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
			deductions: null,
		},
	],
	next_cursor:
		"eyJ2IjowLCJpZCI6ImV2dF8zNnhtSHh4akFrcXh1ZkRmOXlIQVBOZlJyTE0iLCJ0IjoxNzY1OTU2NTEyMDU3fQ",
};

export type ApiEventsListV2_3Response = z.infer<
	typeof ApiEventsListV2_3ResponseSchema
>;

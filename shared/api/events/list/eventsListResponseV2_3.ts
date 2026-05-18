import type { z } from "zod/v4";
import { createCursorPaginatedResponseSchema } from "../../common/cursorPaginationSchemas.js";
import { ApiEventsListItemSchema } from "./eventsListResponse.js";

export const ApiEventsListV2_3ResponseSchema =
	createCursorPaginatedResponseSchema(ApiEventsListItemSchema);

export type ApiEventsListV2_3Response = z.infer<
	typeof ApiEventsListV2_3ResponseSchema
>;

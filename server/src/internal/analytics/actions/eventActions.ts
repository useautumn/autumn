import { _legacyListRawEvents } from "./_legacyListRawEvents.js";
import { aggregate } from "./aggregate";
import { getCountAndSum } from "./getCountAndSum.js";
import { getEventById } from "./getEventById.js";
import { getTopEventNames } from "./getTopEventNames.js";
import { listEventNames } from "./listEventNames.js";
import { listEvents } from "./listEvents.js";
import { listRawEvents } from "./listRawEvents.js";

export const eventActions = {
	aggregate,
	getCountAndSum,
	getEventById,
	getTopEventNames,
	listEventNames,
	listEvents,
	listRawEvents,
	/** @deprecated Use listRawEvents instead. Returns additional fields (idempotency_key, entity_id). */
	_legacyListRawEvents,
} as const;

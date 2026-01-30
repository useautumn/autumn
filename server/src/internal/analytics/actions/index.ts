import { aggregate } from "./aggregate.js";
import { getCountAndSum } from "./getCountAndSum.js";
import { getEventById } from "./getEventById.js";
import { getTopEventNames } from "./getTopEventNames.js";
import { listEventNames } from "./listEventNames.js";
import { listRawEvents } from "./listRawEvents.js";

export const eventActions = {
	aggregate,
	getCountAndSum,
	getEventById,
	getTopEventNames,
	listEventNames,
	listRawEvents,
} as const;

import { aggregate } from "./aggregate";
import { getCountAndSum } from "./getCountAndSum.js";
import { getEventById } from "./getEventById.js";
import { getTopEventNames } from "./getTopEventNames.js";
import { listByCursor } from "./listByCursor.js";
import { listEventNames } from "./listEventNames.js";
import { listEvents } from "./listEvents.js";
import { listRawEvents } from "./listRawEvents.js";

export const eventActions = {
	aggregate,
	getCountAndSum,
	getEventById,
	getTopEventNames,
	listByCursor,
	listEventNames,
	listEvents,
	listRawEvents,
} as const;

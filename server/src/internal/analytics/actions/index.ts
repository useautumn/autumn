import { aggregate } from "./aggregate.js";
import { getCountAndSum } from "./getCountAndSum.js";
import { getTopEventNames } from "./getTopEventNames.js";
import { listRawEvents } from "./listRawEvents.js";

export const eventActions = {
	aggregate,
	getCountAndSum,
	getTopEventNames,
	listRawEvents,
} as const;

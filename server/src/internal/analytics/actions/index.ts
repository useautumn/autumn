import { aggregateEvents } from "./aggregateEvents.js";
import { getTopEventNames } from "./getTopEventNames.js";

export const eventActions = {
	getTopEventNames,
	aggregate: aggregateEvents,
};

import { makeExistenceParser } from "./makeExistenceParser.js";

export const parseRolloverExistence = makeExistenceParser({
	field: "rollover",
	scopePath: "plan.item.rollover",
});

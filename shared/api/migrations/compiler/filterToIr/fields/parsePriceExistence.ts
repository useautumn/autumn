import { makeExistenceParser } from "./makeExistenceParser.js";

export const parsePriceExistence = makeExistenceParser({
	field: "price",
	scopePath: "plan.item.price",
});

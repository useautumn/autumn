import { deleteByInternalId } from "./deleteByInternalId.js";
import { getByCustomerId } from "./getByCustomerId.js";
import { insertMany } from "./insertMany.js";

export const customerStore = {
	deleteByInternalId,
	getByCustomerId,
	insertMany,
};

import { deleteByInternalCustomerId } from "./deleteByInternalCustomerId.js";
import { insertMany } from "./insertMany.js";
import { listActiveByInternalCustomerId } from "./listActiveByInternalCustomerId.js";

export const customerProductStore = {
	deleteByInternalCustomerId,
	insertMany,
	listActiveByInternalCustomerId,
};

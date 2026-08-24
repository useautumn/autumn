import { insertMany } from "./insertMany.js";
import { listActiveByInternalCustomerId } from "./listActiveByInternalCustomerId.js";

export const customerProductStore = {
	insertMany,
	listActiveByInternalCustomerId,
};

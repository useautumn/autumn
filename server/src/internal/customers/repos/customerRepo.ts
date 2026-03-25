import { getFullCustomerV2 } from "./getFullCustomerV2.js";

export const customerRepo = {
	getFullV2: getFullCustomerV2,
} as const;

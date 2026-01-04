import { createPagePaginatedResponseSchema } from "../../common/pagePaginationSchemas";
import { ApiCusExpandSchema, ApiCustomerSchema } from "../apiCustomer";

// Create omit mask from expand schema keys
const expandKeys = Object.keys(ApiCusExpandSchema.shape) as Array<
	keyof typeof ApiCusExpandSchema.shape
>;
const omitMask = Object.fromEntries(expandKeys.map((k) => [k, true])) as {
	[K in keyof typeof ApiCusExpandSchema.shape]: true;
};

export const ListCustomersResponseSchema = createPagePaginatedResponseSchema(
	ApiCustomerSchema.omit(omitMask),
);

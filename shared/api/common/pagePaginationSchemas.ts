import { z } from "zod/v4";

export const PagePaginationDefaults = {
	Limit: 100,
	MaxLimit: 1000,
};

export const createPaginationParamsSchema = ({
	defaultLimit = PagePaginationDefaults.Limit,
}: {
	defaultLimit?: number;
} = {}) =>
	z.object({
		offset: z.coerce
			.number()
			.int()
			.min(0)
			.default(0)
			.describe("Number of items to skip"),
		limit: z.coerce
			.number()
			.int()
			.min(1)
			.max(PagePaginationDefaults.MaxLimit)
			.default(defaultLimit)
			.describe(
				`Number of items to return. Default ${defaultLimit}, max ${PagePaginationDefaults.MaxLimit}.`,
			),
	});

/**
 * Creates a page pagination response schema.
 * @param itemSchema - The schema for the items in the list.
 * @param includeCustomerTotal - Whether to include the total number of customers available in the current organization and environment.
 * @returns The page pagination response schema.
 */
export const createPagePaginatedResponseSchema = <T extends z.ZodType>(
	itemSchema: T,
	includeCustomerTotal = false,
) =>
	z.object({
		list: z.array(itemSchema).meta({
			description: "Array of items for current page",
		}),
		has_more: z
			.boolean()
			.describe("Whether more results exist after this page"),
		offset: z.number().describe("Current offset position"),
		limit: z.number().describe("Limit passed in the request"),
		total: z
			.number()
			.describe("Total number of items returned in the current page"),
		...(!includeCustomerTotal
			? {}
			: {
					total_customer_count: z
						.number()
						.describe(
							"Total number of customers available in the current organization and environment",
						),
				}),
	});

export type PagePaginatedResponse<T> = {
	list: T[];
	limit: number;
	total: number;
	has_more: boolean;
	offset: number;
};

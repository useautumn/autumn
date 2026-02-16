// Auto-generated Zod schema
import { z } from "zod";

export const QueryParamsSchema = z.object({
	featureId: z
		.union([z.string(), z.array(z.string())])
		.describe("The feature ID(s) to query"),
	range: z
		.union([
			z.literal("24h"),
			z.literal("7d"),
			z.literal("30d"),
			z.literal("90d"),
			z.literal("last_cycle"),
		])
		.nullable()
		.describe(
			"Time range for the query (defaults to last_cycle if not provided)",
		)
		.optional(),
});

export interface QueryParams {
	/**
	 * The feature ID(s) to query
	 */
	featureId: string | Array<string>;

	/**
	 * Time range for the query (defaults to last_cycle if not provided)
	 */
	range?: "24h" | "7d" | "30d" | "90d" | "last_cycle" | null;
}

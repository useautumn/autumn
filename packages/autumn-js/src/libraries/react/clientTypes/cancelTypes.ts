// Auto-generated Zod schema
import { z } from "zod";

export const CancelParamsSchema = z.object({
	productId: z.string().describe("The ID of the product to cancel"),
	cancelImmediately: z
		.boolean()
		.describe("Whether to cancel the product immediately or at period end")
		.optional(),
	entityId: z
		.string()
		.nullable()
		.describe("The ID of the entity (optional)")
		.optional(),
	prorate: z
		.boolean()
		.nullable()
		.describe(
			"Whether to prorate the cancellation (defaults to true if not specified)",
		)
		.optional(),
});

export interface CancelParams {
	/**
	 * The ID of the product to cancel
	 */
	productId: string;

	/**
	 * Whether to cancel the product immediately or at period end
	 */
	cancelImmediately?: boolean;

	/**
	 * The ID of the entity (optional)
	 */
	entityId?: string | null;

	/**
	 * Whether to prorate the cancellation (defaults to true if not specified)
	 */
	prorate?: boolean | null;
}

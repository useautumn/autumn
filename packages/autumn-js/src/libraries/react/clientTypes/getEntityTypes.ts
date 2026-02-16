// Auto-generated Zod schema
import { z } from "zod";

export const EntityGetParamsSchema = z.object({
	expand: z.array(z.unknown()).describe("Query param:").optional(),
});

export interface EntityGetParams {
	/**
	 * Query param:
	 */
	expand?: "invoices"[];
}

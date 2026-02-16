// Auto-generated Zod schema
import { z } from "zod";

export const BillingPortalParamsSchema = z.object({
	returnUrl: z
		.string()
		.describe(
			"URL to return to after exiting the billing portal. Must include http:// or\nhttps://",
		)
		.optional(),
	openInNewTab: z
		.boolean()
		.optional()
		.describe("Whether to open billing portal in a new tab"),
});

export interface BillingPortalParams {
	/**
   * URL to return to after exiting the billing portal. Must include http:// or
https://
   */
	returnUrl?: string;

	/**
	 * Whether to open billing portal in a new tab
	 */
	openInNewTab?: boolean;
}

// Auto-generated Zod schema
import { z } from "zod";

export const SetupPaymentParamsSchema = z.object({
	checkoutSessionParams: z
		.record(z.string(), z.unknown())
		.describe("Additional parameters for the checkout session")
		.optional(),
	successUrl: z
		.string()
		.describe("URL to redirect to after successful payment setup")
		.optional(),
	openInNewTab: z
		.boolean()
		.optional()
		.describe("Whether to open payment setup in a new tab"),
});

export interface SetupPaymentParams {
	/**
	 * Additional parameters for the checkout session
	 */
	checkoutSessionParams?: { [key: string]: unknown };

	/**
	 * URL to redirect to after successful payment setup
	 */
	successUrl?: string;

	/**
	 * Whether to open payment setup in a new tab
	 */
	openInNewTab?: boolean;
}

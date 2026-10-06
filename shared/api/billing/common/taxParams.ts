import { z } from "zod/v4";

export const AutomaticTaxParamsSchema = z
	.object({
		enabled: z.boolean().meta({
			description:
				"Whether to calculate tax automatically through Stripe for this request. Defaults to the organization's automatic tax setting.",
		}),
	})
	.meta({ title: "AutomaticTaxParams" });

export const TaxParamsSchema = z
	.object({
		automatic_tax: AutomaticTaxParamsSchema.optional().meta({
			description:
				"Override the organization's automatic tax setting for this request. Can't be enabled together with rate_id or tax_rate_id.",
		}),
		rate_id: z.string().optional().meta({
			description:
				"Stripe tax rate ID (txr_...) to apply instead of automatic tax. Takes precedence over the top-level tax_rate_id.",
		}),
	})
	.meta({
		title: "TaxParams",
		description: "Tax behavior for this request.",
	});

export type TaxParams = z.infer<typeof TaxParamsSchema>;

import { ApiCusFeatureSchema } from "@api/customers/cusFeatures/apiCusFeature.js";
import { ApiCusProductSchema } from "@api/customers/cusProducts/apiCusProduct.js";
import { ApiInvoiceSchema } from "@api/others/apiInvoice.js";
import { AppEnv } from "@models/genModels/genEnums.js";
import { z } from "zod/v4";

export const ApiBaseEntitySchema = z.object({
	id: z.string().nullable().meta({
		description: "The unique identifier of the entity",
		example: "<string>",
	}),
	name: z.string().nullable().meta({
		description: "The name of the entity",
		example: "<string>",
	}),
	customer_id: z.string().nullish().meta({
		description: "The customer ID this entity belongs to",
		example: "<string>",
	}),
	feature_id: z.string().nullish(),
	created_at: z.number().meta({
		description: "Unix timestamp when the entity was created",
		example: 1686168121,
	}),
	env: z.enum(AppEnv).meta({
		description: "The environment (sandbox/live)",
		example: "live",
	}),
});

export const ApiEntitySchema = ApiBaseEntitySchema.extend({
	products: z.array(ApiCusProductSchema).optional().meta({
		description: "Products associated with this entity",
		example: [],
	}),
	features: z.record(z.string(), ApiCusFeatureSchema).optional().meta({
		description: "Features associated with this entity",
		example: {},
	}),
	invoices: z.array(ApiInvoiceSchema).optional().meta({
		description:
			"Invoices for this entity (only included when expand=invoices)",
		example: [],
	}),
});

export type EntityResponse = z.infer<typeof ApiEntitySchema>;

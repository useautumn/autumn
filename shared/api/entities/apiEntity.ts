import { ApiCusFeatureSchema } from "@api/customers/cusFeatures/apiCusFeature.js";
import { ApiCusProductSchema } from "@api/customers/cusProducts/apiCusProduct.js";
import { ApiInvoiceSchema } from "@api/others/apiInvoice.js";
import { AppEnv } from "@models/genModels/genEnums.js";
import { z } from "zod/v4";

const entityDescriptions = {
	id: "The unique identifier of the entity",
	name: "The name of the entity",
	customer_id: "The customer ID this entity belongs to",
	feature_id: "The feature ID this entity belongs to",
	created_at: "Unix timestamp when the entity was created",
	env: "The environment (sandbox/live)",
};

export const ApiBaseEntitySchema = z.object({
	id: z.string().nullable().meta({
		description: entityDescriptions.id,
	}),
	name: z.string().nullable().meta({
		description: entityDescriptions.name,
	}),
	customer_id: z.string().nullish().meta({
		description: entityDescriptions.customer_id,
	}),
	feature_id: z.string().nullish().meta({
		description: entityDescriptions.feature_id,
	}),
	created_at: z.number().meta({
		description: entityDescriptions.created_at,
	}),
	env: z.enum(AppEnv).meta({
		description: entityDescriptions.env,
	}),
});

export const ApiEntitySchema = ApiBaseEntitySchema.extend({
	products: z.array(ApiCusProductSchema).optional().meta({
		description: "Products associated with this entity",
	}),
	features: z.record(z.string(), ApiCusFeatureSchema).optional().meta({
		description: "Features associated with this entity",
	}),
	invoices: z.array(ApiInvoiceSchema).optional().meta({
		description:
			"Invoices for this entity (only included when expand=invoices)",
	}),
});

export type ApiEntity = z.infer<typeof ApiEntitySchema>;

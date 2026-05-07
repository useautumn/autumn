import { z } from "zod/v4";
import { ApiEntityBillingControlsSchema } from "../../billingControls/entityBillingControls.js";
import {
	createPagePaginatedResponseSchema,
	createPaginationParamsSchema,
} from "../../common/pagePaginationSchemas.js";
import { ApiBaseEntitySchema } from "../apiBaseEntity.js";

export const ListEntitiesParamsSchema = createPaginationParamsSchema({
	defaultLimit: 10,
}).extend({
	customer_id: z.string().meta({
		description: "The ID of the customer whose entities should be listed.",
	}),
});

export const ApiEntityListItemSchema = ApiBaseEntitySchema.extend({
	billing_controls: ApiEntityBillingControlsSchema.optional().meta({
		description: "Billing controls for the entity.",
	}),
});

export const ListEntitiesResponseSchema = createPagePaginatedResponseSchema(
	ApiEntityListItemSchema,
).extend({
	total_count: z.number().int().nonnegative().meta({
		description:
			"Total number of entities available for the customer before pagination is applied.",
	}),
	total_filtered_count: z.number().int().nonnegative().meta({
		description:
			"Total number of entities matching the current filter before pagination is applied.",
	}),
});

export type ListEntitiesParams = z.infer<typeof ListEntitiesParamsSchema>;
export type ApiEntityListItem = z.infer<typeof ApiEntityListItemSchema>;
export type ListEntitiesResponse = z.infer<typeof ListEntitiesResponseSchema>;

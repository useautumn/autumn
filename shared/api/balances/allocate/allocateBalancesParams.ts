import { z } from "zod/v4";
import { ResetInterval } from "../../../models/productModels/intervals/resetInterval.js";

export const MAX_ALLOCATIONS_PER_REQUEST = 250;

export const AllocateBalancesParamsV0Schema = z.object({
	customer_id: z.string().meta({ description: "The ID of the customer." }),
	feature_id: z.string().meta({
		description: "The feature whose shared credits are being allocated.",
	}),
	interval: z.enum(ResetInterval).meta({
		description:
			"Which shared credits to allocate: the customer-level balances that reset on this interval.",
	}),
	allocations: z
		.array(
			z.object({
				entity_id: z.string().meta({ description: "The ID of the entity." }),
				amount: z.number().nonnegative().meta({
					description:
						"Credits held for this entity each cycle. 0 releases its allocation.",
				}),
			}),
		)
		.min(1)
		.max(MAX_ALLOCATIONS_PER_REQUEST)
		.meta({
			description:
				"Entities not listed are unchanged. On the first allocation, earlier entries are filled first.",
		}),
});

export type AllocateBalancesParamsV0 = z.infer<
	typeof AllocateBalancesParamsV0Schema
>;

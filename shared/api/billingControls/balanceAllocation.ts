import { z } from "zod/v4";
import { ResetInterval } from "../../models/productModels/intervals/resetInterval.js";
import { MAX_ALLOCATED_ENTITIES } from "../balances/allocate/allocateBalancesParams.js";

export const BalanceAllocationControlSchema = z.object({
	feature_id: z.string().meta({
		description: "The feature whose shared customer credits are allocated.",
	}),
	interval: z.enum(ResetInterval).meta({
		description: "The reset interval of the shared credits being allocated.",
	}),
	allocations: z
		.array(
			z.object({
				entity_id: z.string().meta({ description: "The public entity ID." }),
				amount: z.number().nonnegative().meta({
					description:
						"Requested credits per cycle, before proportional scaling. 0 releases the allocation.",
				}),
			}),
		)
		.max(MAX_ALLOCATED_ENTITIES)
		.meta({
			description:
				"Complete list of entity allocations for this feature. Omitted entities release their shares.",
		}),
});

export const BalanceAllocationControlsSchema = z
	.array(BalanceAllocationControlSchema)
	.superRefine((controls, ctx) => {
		const features = new Set<string>();
		for (const [index, control] of controls.entries()) {
			if (features.has(control.feature_id)) {
				ctx.addIssue({
					code: "custom",
					message: "Each feature may have only one allocation configuration",
					path: [index, "feature_id"],
				});
			}
			features.add(control.feature_id);
			const entities = new Set<string>();
			for (const [entityIndex, allocation] of control.allocations.entries()) {
				if (entities.has(allocation.entity_id)) {
					ctx.addIssue({
						code: "custom",
						message: "Each entity may appear only once per feature",
						path: [index, "allocations", entityIndex, "entity_id"],
					});
				}
				entities.add(allocation.entity_id);
			}
		}
	});

export type BalanceAllocationControl = z.infer<
	typeof BalanceAllocationControlSchema
>;

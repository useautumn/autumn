import type { CreatePlanParams } from "@api/products/crud/createPlanParamsV0";
import type { UpdatePlanParams } from "@api/products/crud/updatePlanParamsV0";
import { planItemParamsV1ToPlanItemV0 } from "@api/products/items/mappers/planItemParamsV1ToPlanItemV0";
import { planV0ToProductItems } from "@api/products/mappers/planV0ToProductItems";
import { AppEnv } from "@models/genModels/genEnums";
import type { ProductV2 } from "@models/productV2Models/productV2Models";
import type { SharedContext } from "../../../../types/sharedContext";

export function planParamsV1ToProductV2({
	ctx,
	params,
	overrides = {
		version: 1,
		env: AppEnv.Sandbox,
		created_at: Date.now(),
	},
}: {
	ctx: SharedContext;
	params: CreatePlanParams | UpdatePlanParams;

	// Here to enforce type checking, probably not used but just to be sure.
	overrides?: {
		version: number;
		env: AppEnv;
		created_at: number;
	};
}): Partial<ProductV2> {
	const planFeatures =
		params.items?.map((item) => planItemParamsV1ToPlanItemV0({ ctx, item })) ??
		[];

	const price = params.price;

	// Convert plan to items using shared utility
	const items = planV0ToProductItems({
		ctx,
		plan: { features: planFeatures, price: price ?? null },
	});

	// Check if archived field exists on plan (it's on ApiPlan, not CreatePlanParams)
	const archived =
		"archived" in params && params.archived !== undefined
			? params.archived
			: undefined;

	return {
		id: params.id, // fallback just for placeholders...
		name: params.name,
		description: params.description ?? null,
		is_add_on: params.add_on,
		is_default: params.auto_enable,

		group: params.group ?? "",
		items,
		free_trial: params.free_trial
			? {
					duration: params.free_trial.duration_type,
					length: params.free_trial.duration_length,
					unique_fingerprint: false,
					card_required: params.free_trial.card_required,
				}
			: null,
		...(archived !== undefined && { archived }),

		...overrides,
	};
}

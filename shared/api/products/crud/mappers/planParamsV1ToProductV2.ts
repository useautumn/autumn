import type { CreatePlanParams } from "@api/products/crud/createPlanParamsV1";
import type { UpdatePlanParams } from "@api/products/crud/updatePlanParamsV1";
import type { AppEnv } from "@models/genModels/genEnums";
import type { FullProduct } from "@models/productModels/productModels";
import type { ProductV2 } from "@models/productV2Models/productV2Models";
import { notNullish } from "@utils/index";
import type { SharedContext } from "../../../../types/sharedContext";
import { planParamsV1ToProductItems } from "./planParamsV1ToProductItems";

export function planParamsV1ToProductV2({
	ctx,
	params,
	currentFullProduct,
}: {
	ctx: SharedContext;
	params: CreatePlanParams | UpdatePlanParams;
	currentFullProduct?: FullProduct;

	// Here to enforce type checking, probably not used but just to be sure.
	overrides?: {
		version: number;
		env: AppEnv;
		created_at: number;
	};
}): Partial<ProductV2> {
	// Convert plan to items using shared utility
	const items = planParamsV1ToProductItems({
		ctx,
		params: {
			price: params.price,
			items: params.items,
		},
		currentFullProduct,
	});

	// Check if archived field exists on plan (it's on ApiPlan, not CreatePlanParams)
	const archived =
		"archived" in params && params.archived !== undefined
			? params.archived
			: undefined;

	return {
		id: params.id, // fallback just for placeholders...
		name: params.name,
		description: params.description,
		is_add_on: params.add_on,
		is_default: params.auto_enable,

		group: params.group ?? "",
		items,
		free_trial: notNullish(params.free_trial)
			? {
					duration: params.free_trial.duration_type,
					length: params.free_trial.duration_length,
					unique_fingerprint: false,
					card_required: params.free_trial.card_required,
				}
			: params.free_trial,
		...(archived !== undefined && { archived }),
	};
}

import type { CreatePlanParams } from "@api/products/crud/createPlanParamsV1";
import type { UpdatePlanParams } from "@api/products/crud/updatePlanParamsV1";
import type { AppEnv } from "@models/genModels/genEnums";
import type { FullProduct } from "@models/productModels/productModels";
import type { ProductV2 } from "@models/productV2Models/productV2Models";
import { notNullish } from "@utils/index";
import type { SharedContext } from "../../../../types/sharedContext";
import { planParamsV1ToProductItems } from "./planParamsV1ToProductItems";

type ProductV2UpdateParams = Partial<ProductV2> & {
	base_plan_id?: string | null;
};

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
}): ProductV2UpdateParams {
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

	const config =
		"config" in params && params.config !== undefined
			? params.config
			: undefined;
	const billingControls =
		"billing_controls" in params && params.billing_controls !== undefined
			? params.billing_controls
			: undefined;

	const metadata =
		"metadata" in params && params.metadata !== undefined
			? params.metadata
			: undefined;

	const createInStripe =
		"create_in_stripe" in params && params.create_in_stripe !== undefined
			? params.create_in_stripe
			: undefined;

	const isDefault: boolean | undefined =
		"is_default" in params && params.is_default !== undefined
			? (params.is_default as boolean)
			: undefined;

	const result: ProductV2UpdateParams = {};

	if (params.id !== undefined) result.id = params.id;
	if (params.name !== undefined) result.name = params.name;
	if (params.description !== undefined) result.description = params.description;
	if (params.add_on !== undefined) result.is_add_on = params.add_on;
	if (isDefault !== undefined) {
		result.is_default = isDefault;
	} else if (params.auto_enable !== undefined) {
		result.is_default = params.auto_enable;
	}
	if (params.group !== undefined) result.group = params.group;
	result.items = items;
	if (params.free_trial !== undefined) {
		result.free_trial = notNullish(params.free_trial)
			? {
					duration: params.free_trial.duration_type,
					length: params.free_trial.duration_length,
					unique_fingerprint: false,
					card_required: params.free_trial.card_required,
				}
			: params.free_trial;
	}
	if (archived !== undefined) result.archived = archived;
	if (config !== undefined) result.config = config;
	if (billingControls !== undefined) result.billing_controls = billingControls;
	if (metadata !== undefined) result.metadata = metadata;
	if ("base_plan_id" in params && params.base_plan_id !== undefined) {
		result.base_plan_id = params.base_plan_id;
	}
	if (createInStripe !== undefined)
		Object.assign(result, { create_in_stripe: createInStripe });

	return result;
}

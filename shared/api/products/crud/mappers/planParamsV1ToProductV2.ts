import type { CreatePlanParams } from "@api/products/crud/createPlanParamsV0";
import type { UpdatePlanParams } from "@api/products/crud/updatePlanParamsV0";
import { planItemParamsV1ToPlanItemV0 } from "@api/products/items/mappers/planItemParamsV1ToPlanItemV0";
import { planV0ToProductItems } from "@api/products/mappers/planV0ToProductItems";
import type {
	CreateProductV2Params,
	UpdateProductV2Params,
} from "@api/products/productOpModels";
import type { AppEnv } from "@models/genModels/genEnums";
import type { SharedContext } from "../../../../types/sharedContext";

type MapperArgs<TParams extends CreatePlanParams | UpdatePlanParams> = {
	ctx: SharedContext;
	params: TParams;

	// Here to enforce type checking, probably not used but just to be sure.
	overrides?: {
		version: number;
		env: AppEnv;
		created_at: number;
	};
};

export function planParamsV1ToProductV2({
	ctx,
	params,
}: MapperArgs<CreatePlanParams>): CreateProductV2Params;
export function planParamsV1ToProductV2({
	ctx,
	params,
}: MapperArgs<UpdatePlanParams>): UpdateProductV2Params;
export function planParamsV1ToProductV2({
	ctx,
	params,
}: MapperArgs<CreatePlanParams | UpdatePlanParams>):
	| CreateProductV2Params
	| UpdateProductV2Params {
	const mapped: Partial<CreateProductV2Params & UpdateProductV2Params> = {};

	if (params.id !== undefined) {
		mapped.id = params.id;
	}

	if (params.name !== undefined) {
		mapped.name = params.name;
	}

	if ("description" in params) {
		mapped.description = params.description;
	}

	if (params.add_on !== undefined) {
		mapped.is_add_on = params.add_on;
	}

	if (params.auto_enable !== undefined) {
		mapped.is_default = params.auto_enable;
	}

	if (params.group !== undefined) {
		mapped.group = params.group;
	}

	const shouldMapItems = params.items !== undefined || params.price !== undefined;
	if (shouldMapItems) {
		const planFeatures =
			params.items?.map((item) => planItemParamsV1ToPlanItemV0({ ctx, item })) ??
			[];

		mapped.items = planV0ToProductItems({
			ctx,
			plan: { features: planFeatures, price: params.price ?? null },
		});
	}

	// Check if archived field exists on plan (it's on ApiPlan, not CreatePlanParams)
	const archived =
		"archived" in params && params.archived !== undefined
			? params.archived
			: undefined;

	if ("free_trial" in params) {
		mapped.free_trial = params.free_trial
			? {
					duration: params.free_trial.duration_type,
					length: params.free_trial.duration_length,
					unique_fingerprint: false,
					card_required: params.free_trial.card_required,
				}
			: params.free_trial;
	}

	if (archived !== undefined) {
		mapped.archived = archived;
	}

	return mapped as CreateProductV2Params | UpdateProductV2Params;
}

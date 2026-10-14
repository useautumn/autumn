import type { ApiProductItem } from "@api/models";
import { planV0ToProductItems } from "@api/products/mappers/planV0ToProductItems";
import { ApiVersion } from "@api/versionUtils/ApiVersion";
import {
	AffectedResource,
	defineVersionChange,
} from "@api/versionUtils/versionChangeUtils/VersionChange";
import { CusProductStatus } from "@models/cusProductModels/cusProductEnums";
import { getProductItemResponse } from "@utils/productV2Utils/productItemUtils/getProductItemRes";
import type { z } from "zod/v4";
import type { SharedContext } from "../../../../types/sharedContext";
import {
	type ApiSubscription,
	ApiSubscriptionSchema,
} from "../apiSubscription";
import { CusProductLegacyDataSchema } from "../cusProductLegacyData";
import { ApiCusProductV3Schema } from "../previousVersions/apiCusProductV3";

export function transformSubscriptionToCusProductV3({
	input,
	legacyData,
	ctx,
}: {
	input: z.infer<typeof ApiSubscriptionSchema>;
	legacyData?: z.infer<typeof CusProductLegacyDataSchema>;
	ctx: SharedContext;
}): z.infer<typeof ApiCusProductV3Schema> {
	const cusPlanToCusProductV3Status = (plan: ApiSubscription) => {
		if (plan.status === CusProductStatus.Active) {
			if (plan.past_due) {
				return "past_due";
			} else if (plan.trial_ends_at && plan.trial_ends_at > Date.now()) {
				return "trialing";
			}
			return "active";
		}
		return plan.status;
	};

	let items: ApiProductItem[] | null = null;

	if (input.plan && ctx.features) {
		const productItems = planV0ToProductItems({
			ctx,
			plan: input.plan,
		});

		const itemResponses = productItems.map((item) =>
			getProductItemResponse({
				item,
				features: ctx.features,
				options: legacyData?.options,
			}),
		);

		items = itemResponses;
	}

	return {
		id: input.plan_id,

		name: input.plan?.name ?? null,
		group: input.plan?.group ?? null,
		is_default: input.plan?.default ?? false,
		is_add_on: input.add_on,
		version: input.plan?.version ?? undefined,
		items: items,

		status: cusPlanToCusProductV3Status(input),

		canceled_at: input.canceled_at ?? null,
		started_at: input.started_at,
		current_period_start: input.current_period_start,
		current_period_end: input.current_period_end,

		quantity: input.quantity,
	} satisfies z.infer<typeof ApiCusProductV3Schema>;
}

const V1_2_CusPlanChange = defineVersionChange({
	newVersion: ApiVersion.V2_0,
	oldVersion: ApiVersion.V1_2,
	description: [
		"Renamed products to plans",
		"Simplified status enum",
		"Added trial_ends_at field",
	],
	affectedResources: [AffectedResource.Customer],
	newSchema: ApiSubscriptionSchema,
	oldSchema: ApiCusProductV3Schema,

	legacyDataSchema: CusProductLegacyDataSchema,

	transformResponse: transformSubscriptionToCusProductV3,
});

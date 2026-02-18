import { billingParamsV0ToInvoiceModeParams } from "@api/billing/common/mappers/billingParamsV0ToInvoiceModeParams.js";
import { freeTrialParamsV0ToV1 } from "@api/common/freeTrial/mappers/freeTrialParamsV0ToV1.js";
import { ApiVersion } from "@api/versionUtils/ApiVersion.js";
import {
	AffectedResource,
	defineVersionChange,
} from "@api/versionUtils/versionChangeUtils/VersionChange.js";
import { productItemsToCustomizePlanV1 } from "@utils/productV2Utils/productItemUtils/convertProductItem/productItemsToCustomizePlanV1.js";
import type { z } from "zod/v4";
import type { SharedContext } from "../../../../types/sharedContext.js";
import { UpdateSubscriptionV0ParamsSchema } from "../updateSubscriptionV0Params.js";
import { UpdateSubscriptionV1ParamsSchema } from "../updateSubscriptionV1Params.js";

export const V1_2_UpdateSubscriptionParamsChange = defineVersionChange({
	name: "V1.2 Update Subscription Params Change",
	newVersion: ApiVersion.V2_0,
	oldVersion: ApiVersion.V1_Beta,
	description: [
		"Maps free_trial {length,duration} to {duration_length,duration_type}",
		"Maps top-level items to customize.items",
	],
	affectedResources: [AffectedResource.ApiSubscriptionUpdate],
	newSchema: UpdateSubscriptionV1ParamsSchema,
	oldSchema: UpdateSubscriptionV0ParamsSchema,
	affectsRequest: true,
	affectsResponse: false,
	transformRequest: ({
		ctx,
		input,
	}: {
		ctx: SharedContext;
		input: z.infer<typeof UpdateSubscriptionV0ParamsSchema>;
	}): z.infer<typeof UpdateSubscriptionV1ParamsSchema> => {
		const customizeV1 = input.items
			? productItemsToCustomizePlanV1({
					ctx,
					items: input.items,
				})
			: undefined;

		const freeTrialV1 = freeTrialParamsV0ToV1({
			freeTrialParamsV0: input.free_trial,
		});

		const newPlanId = input.product_id ?? undefined;
		const featureQuantities = input.options;

		const invoiceMode = billingParamsV0ToInvoiceModeParams({ input });

		return {
			...input,
			plan_id: newPlanId,
			invoice_mode: invoiceMode,
			feature_quantities: featureQuantities,

			free_trial: freeTrialV1,
			customize: customizeV1,
		};
	},
});

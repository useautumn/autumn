import { billingParamsV0ToCustomizeV1 } from "@api/billing/common/mappers/billingParamsV0ToCustomizeV1";
import { billingParamsV0ToInvoiceModeParams } from "@api/billing/common/mappers/billingParamsV0ToInvoiceModeParams";
import { ApiVersion } from "@api/versionUtils/ApiVersion";
import {
	AffectedResource,
	defineVersionChange,
} from "@api/versionUtils/versionChangeUtils/VersionChange";
import type { z } from "zod/v4";
import type { SharedContext } from "../../../../types/sharedContext";
import { AttachParamsV0Schema } from "../attachParamsV0";
import { AttachParamsV1Schema } from "../attachParamsV1";

export const V1_2_AttachParamsChange = defineVersionChange({
	name: "V1.2 Attach Params Change",
	newVersion: ApiVersion.V2_0,
	oldVersion: ApiVersion.V1_Beta,
	description: [
		"Maps free_trial {length,duration} to {duration_length,duration_type}",
		"Maps top-level items to customize.items",
	],
	affectedResources: [AffectedResource.Attach],
	newSchema: AttachParamsV1Schema,
	oldSchema: AttachParamsV0Schema,
	affectsRequest: true,
	affectsResponse: false,
	transformRequest: ({
		ctx,
		input,
	}: {
		ctx: SharedContext;
		input: z.infer<typeof AttachParamsV0Schema>;
	}): z.infer<typeof AttachParamsV1Schema> => {
		const customizeV1 = billingParamsV0ToCustomizeV1({
			ctx,
			items: input.items,
			freeTrial: input.free_trial,
			billingControls: input.billing_controls,
		});

		const newPlanId = input.product_id ?? undefined;
		const featureQuantities = input.options;

		const invoiceMode = billingParamsV0ToInvoiceModeParams({ input });

		return {
			...input,
			plan_id: newPlanId,
			feature_quantities: featureQuantities,
			invoice_mode: invoiceMode,
			enable_plan_immediately: input.enable_product_immediately,
			customize: customizeV1,
			proration_behavior: input.billing_behavior,
		};
	},
});

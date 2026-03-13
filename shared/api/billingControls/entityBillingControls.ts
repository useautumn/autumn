import { z } from "zod/v4";
import { ApiSpendLimitSchema } from "./spendLimit.js";

export const ApiEntityBillingControlsSchema = z.object({
	spend_limits: z.array(ApiSpendLimitSchema).optional().meta({
		description: "List of overage spend limits per feature.",
	}),
});

export const ApiEntityBillingControlsParamsSchema =
	ApiEntityBillingControlsSchema.check((ctx) => {
		const billingControls = ctx.value;
		const featureIds = new Set<string>();

		for (const [index, spendLimit] of (
			billingControls.spend_limits ?? []
		).entries()) {
			if (!spendLimit.feature_id) {
				continue;
			}

			if (featureIds.has(spendLimit.feature_id)) {
				ctx.issues.push({
					code: "custom",
					message: "Only one spend limit entry is allowed per feature_id",
					input: spendLimit.feature_id,
					path: ["spend_limits", index, "feature_id"],
				});
				return;
			}

			featureIds.add(spendLimit.feature_id);
		}
	});

export type ApiEntityBillingControls = z.infer<
	typeof ApiEntityBillingControlsSchema
>;
export type ApiEntityBillingControlsParams = z.input<
	typeof ApiEntityBillingControlsParamsSchema
>;

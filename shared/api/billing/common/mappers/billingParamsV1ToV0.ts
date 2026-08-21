import { freeTrialParamsV1ToV0 } from "@api/common/freeTrial/mappers/freeTrialParamsV1ToV0";
import type { FullProduct } from "@models/productModels/productModels";
import type { SharedContext } from "../../../../types/sharedContext";
import type { BillingParamsBaseV1 } from "../billingParamsBase/billingParamsBaseV1";
import { hasCustomItems } from "../customizePlan/customizePlanV1";
import { customizePlanV1ToV0 } from "../customizePlan/mappers/customizePlanV1ToV0";

type BillingParamsV1Common = Pick<
	BillingParamsBaseV1,
	"customize" | "feature_quantities" | "invoice_mode" | "proration_behavior"
> & {
	enable_plan_immediately?: boolean;
	plan_id?: string;
} & Record<string, unknown>;

/** Inverse of the V1.2 billing params version change: maps a V1 request back
 * into the V0 dialect, resolving `customize` into a concrete `items` array
 * against the plan's catalog (or current subscription) items. Keys that have
 * no V0 representation are reported in `unrepresentable`, never dropped
 * silently. */
export const billingParamsV1ToV0 = ({
	ctx,
	fullProduct,
	params,
}: {
	ctx: SharedContext;
	fullProduct: FullProduct;
	params: BillingParamsV1Common;
}): { request: Record<string, unknown>; unrepresentable: string[] } => {
	const {
		customize,
		enable_plan_immediately,
		feature_quantities,
		invoice_mode,
		plan_id,
		proration_behavior,
		...rest
	} = params;

	const unrepresentable = [
		customize?.update_items !== undefined && "customize.update_items",
		customize?.remove_licenses !== undefined && "customize.remove_licenses",
	].filter((key): key is string => typeof key === "string");

	const items =
		customize && hasCustomItems(customize) && !unrepresentable.length
			? customizePlanV1ToV0({ ctx, customizePlanV1: customize, fullProduct })
			: undefined;
	const freeTrial = freeTrialParamsV1ToV0({
		freeTrialParamsV1: customize?.free_trial,
	});

	return {
		request: {
			...rest,
			...(plan_id !== undefined ? { product_id: plan_id } : {}),
			...(feature_quantities !== undefined
				? { options: feature_quantities }
				: {}),
			...(proration_behavior !== undefined
				? { billing_behavior: proration_behavior }
				: {}),
			...(items !== undefined ? { items } : {}),
			...(freeTrial !== undefined ? { free_trial: freeTrial } : {}),
			...(customize?.billing_controls !== undefined
				? { billing_controls: customize.billing_controls }
				: {}),
			...(customize?.upsert_licenses !== undefined
				? { upsert_licenses: customize.upsert_licenses }
				: {}),
			...(invoice_mode?.enabled
				? {
						invoice: true,
						finalize_invoice: invoice_mode.finalize ?? true,
						...(invoice_mode.invoice_template_id !== undefined
							? { invoice_template_id: invoice_mode.invoice_template_id }
							: {}),
						...(invoice_mode.net_terms_days !== undefined
							? { net_terms_days: invoice_mode.net_terms_days }
							: {}),
					}
				: {}),
			...(invoice_mode?.enable_plan_immediately || enable_plan_immediately
				? { enable_product_immediately: true }
				: {}),
		},
		unrepresentable,
	};
};

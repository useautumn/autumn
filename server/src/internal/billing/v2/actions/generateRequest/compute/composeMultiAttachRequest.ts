import type { CreateSchedulePlanV0 } from "@autumn/shared";
import { freeTrialParamsV1ToV0 } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { resolveCustomizedPlan } from "@/internal/billing/v2/actions/resolveBillingRequest";

const SINGLE_ATTACH_ONLY_FIELDS = [
	"billing_cycle_anchor",
	"carry_over_balances",
	"carry_over_usages",
	"custom_line_items",
	"ends_at",
	"license_quantities",
	"no_billing_changes",
	"plan_schedule",
	"remove_plan_ids",
] as const;

/** Maps a generated attach with `additional_plans` into the resolved
 * multi-attach dialect: `plans[]` with customize resolved to concrete items,
 * single-attach-only fields reported as unrepresentable. */
export const composeMultiAttachRequest = async ({
	ctx,
	generated,
	customerId,
}: {
	ctx: AutumnContext;
	generated: Record<string, unknown>;
	customerId: string;
}): Promise<{
	request: Record<string, unknown>;
	unrepresentable: string[];
}> => {
	const additionalPlans = generated.additional_plans as CreateSchedulePlanV0[];
	const primaryCustomize = generated.customize as
		| Record<string, unknown>
		| undefined;
	const {
		free_trial: primaryFreeTrial,
		upsert_licenses: primaryLicenses,
		...planCustomize
	} = primaryCustomize ?? {};

	const primaryPlan = {
		plan_id: generated.plan_id,
		...(generated.entity_id !== undefined
			? { entity_id: generated.entity_id }
			: {}),
		...(generated.version !== undefined ? { version: generated.version } : {}),
		...(generated.feature_quantities !== undefined
			? { feature_quantities: generated.feature_quantities }
			: {}),
		...(Object.keys(planCustomize).length > 0
			? { customize: planCustomize }
			: {}),
	} as CreateSchedulePlanV0;

	const plans = await Promise.all(
		[primaryPlan, ...additionalPlans].map((plan) =>
			resolveCustomizedPlan({ ctx, plan }),
		),
	);

	const freeTrial = freeTrialParamsV1ToV0({
		freeTrialParamsV1: primaryFreeTrial as never,
	});

	const unrepresentable = SINGLE_ATTACH_ONLY_FIELDS.filter(
		(field) => generated[field] !== undefined,
	)
		.map(String)
		.filter(
			(field) =>
				!(field === "plan_schedule" && generated.plan_schedule === "immediate"),
		);
	if (primaryLicenses !== undefined) {
		unrepresentable.push("customize.upsert_licenses");
	}

	return {
		request: {
			customer_id: customerId,
			plans,
			...(freeTrial !== undefined ? { free_trial: freeTrial } : {}),
			...(generated.starts_at !== undefined
				? { starts_at: generated.starts_at }
				: {}),
			...(generated.currency !== undefined
				? { currency: generated.currency }
				: {}),
			...(generated.discounts !== undefined
				? { discounts: generated.discounts }
				: {}),
			...(generated.proration_behavior !== undefined
				? { billing_behavior: generated.proration_behavior }
				: {}),
			...(generated.new_billing_subscription !== undefined
				? { new_billing_subscription: generated.new_billing_subscription }
				: {}),
			...(generated.enable_plan_immediately !== undefined
				? { enable_plan_immediately: generated.enable_plan_immediately }
				: {}),
		},
		unrepresentable,
	};
};

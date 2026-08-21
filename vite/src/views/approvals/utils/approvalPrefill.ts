import type {
	BillingBehavior,
	FreeTrialDuration,
	PlanTiming,
} from "@autumn/shared";
import type { AttachForm } from "@/components/forms/attach-v2/attachFormSchema";
import type { UpdateSubscriptionForm } from "@/components/forms/update-subscription-v2/updateSubscriptionFormSchema";

type Params = Record<string, unknown>;

const record = (value: unknown): Params | undefined =>
	value && typeof value === "object" && !Array.isArray(value)
		? (value as Params)
		: undefined;

const prepaidOptionsFrom = (value: unknown): Record<string, number> => {
	if (!Array.isArray(value)) return {};
	return Object.fromEntries(
		value.flatMap((entry) => {
			const quantity = record(entry)?.quantity;
			const featureId = record(entry)?.feature_id;
			return typeof featureId === "string" && typeof quantity === "number"
				? [[featureId, quantity]]
				: [];
		}),
	);
};

/** Accepts both V1 ({duration_length, duration_type}) and V0 ({length,
 * duration}) trial shapes — approvals store whatever the agent sent. */
const trialOverridesFrom = (value: unknown) => {
	const trial = record(value);
	if (!trial) return {};
	const length = trial.duration_length ?? trial.length;
	const duration = trial.duration_type ?? trial.duration;
	if (typeof length !== "number") return {};
	return {
		trialCardRequired: trial.card_required !== false,
		trialDuration: (duration ?? "day") as FreeTrialDuration,
		trialEnabled: true,
		trialLength: length,
		...(trial.on_end === "bill" || trial.on_end === "revert"
			? { trialOnEnd: trial.on_end as "bill" | "revert" }
			: {}),
	};
};

/** Maps an approval's stored attach request (agent V1 shape, no `customize` —
 * customized approvals are not deep-linked) into sheet form overrides. Only
 * fields present in the request are set. */
export const attachOverridesFromParams = (
	request: Params,
): Partial<AttachForm> => {
	const overrides: Partial<AttachForm> = {};
	if (typeof request.plan_id === "string")
		overrides.productId = request.plan_id;
	const prepaid = prepaidOptionsFrom(
		request.feature_quantities ?? request.options,
	);
	if (Object.keys(prepaid).length) overrides.prepaidOptions = prepaid;
	if (typeof request.version === "number") overrides.version = request.version;
	if (typeof request.proration_behavior === "string") {
		overrides.prorationBehavior = request.proration_behavior as BillingBehavior;
	}
	if (typeof request.plan_schedule === "string") {
		overrides.planSchedule = request.plan_schedule as PlanTiming;
	}
	if (typeof request.starts_at === "number") {
		overrides.startDate = request.starts_at;
	}
	if (typeof request.ends_at === "number") overrides.endDate = request.ends_at;
	if (typeof request.enable_plan_immediately === "boolean") {
		overrides.enablePlanImmediately = request.enable_plan_immediately;
	}
	if (Array.isArray(request.remove_plan_ids)) {
		overrides.removePlanIds = request.remove_plan_ids.filter(
			(id): id is string => typeof id === "string",
		);
	}
	if (typeof request.currency === "string") {
		overrides.currency = request.currency;
	}
	return { ...overrides, ...trialOverridesFrom(request.free_trial) };
};

export const updateSubscriptionOverridesFromParams = (
	request: Params,
): Partial<UpdateSubscriptionForm> => {
	const overrides: Partial<UpdateSubscriptionForm> = {};
	const prepaid = prepaidOptionsFrom(
		request.feature_quantities ?? request.options,
	);
	if (Object.keys(prepaid).length) overrides.prepaidOptions = prepaid;
	if (typeof request.version === "number") overrides.version = request.version;
	if (typeof request.proration_behavior === "string") {
		overrides.billingBehavior = request.proration_behavior as BillingBehavior;
	}
	return { ...overrides, ...trialOverridesFrom(request.free_trial) };
};

import type {
	CreateScheduleBillingContext,
	SetPlansParamsV0,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { computeSetPlansPlan } from "@/internal/billing/v2/actions/setPlans/compute/computeSetPlansPlan";
import { handleSetPlansErrors } from "@/internal/billing/v2/actions/setPlans/errors/handleSetPlansErrors";
import { setupSetPlansTimeline } from "@/internal/billing/v2/actions/setPlans/setup/setupSetPlansTimeline";

type UndeclaredPlans = SetPlansParamsV0["undeclared_plans"];

/** The timeline setup would read for this context, then the plan compute builds from it. */
export const computeSetPlansPlanFromContext = ({
	ctx,
	billingContext,
	undeclaredPlans = "end",
}: {
	ctx: AutumnContext;
	billingContext: CreateScheduleBillingContext;
	undeclaredPlans?: UndeclaredPlans;
}) => {
	const timeline = setupSetPlansTimeline({
		ctx,
		billingContext,
		params: { undeclared_plans: undeclaredPlans },
	});
	return {
		timeline,
		...computeSetPlansPlan({ ctx, billingContext, timeline }),
	};
};

export const handleSetPlansErrorsFromContext = ({
	ctx,
	billingContext,
	params,
	preview,
}: {
	ctx: AutumnContext;
	billingContext: CreateScheduleBillingContext;
	params: Parameters<typeof handleSetPlansErrors>[0]["params"];
	preview?: boolean;
}) =>
	handleSetPlansErrors({
		ctx,
		billingContext,
		timeline: setupSetPlansTimeline({
			ctx,
			billingContext,
			params: { undeclared_plans: "end" },
		}),
		params,
		preview,
	});

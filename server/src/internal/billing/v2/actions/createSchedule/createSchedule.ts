import type { CreateScheduleParamsV0 } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { setPlans } from "@/internal/billing/v2/actions/setPlans/setPlans";
import { createScheduleParamsToSetPlansParams } from "@/internal/billing/v2/actions/setPlans/utils/createScheduleParamsToSetPlansParams";

/** Create a schedule: set plans, judged by approval rules as create_schedule. */
export const createSchedule = ({
	ctx,
	params,
	preview = false,
}: {
	ctx: AutumnContext;
	params: CreateScheduleParamsV0;
	preview?: boolean;
}) =>
	setPlans({
		ctx,
		params: createScheduleParamsToSetPlansParams({ params }),
		preview,
		approvalRoute: "billing.create_schedule",
	});

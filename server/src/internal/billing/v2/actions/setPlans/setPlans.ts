import type {
	CreateScheduleParamsV0,
	CreateScheduleResponse,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { createSchedule } from "@/internal/billing/v2/actions/createSchedule/createSchedule";

export const setPlans = ({
	ctx,
	params,
	skipAutumnCheckout,
}: {
	ctx: AutumnContext;
	params: CreateScheduleParamsV0;
	skipAutumnCheckout?: boolean;
}): Promise<CreateScheduleResponse> =>
	createSchedule({ ctx, params, skipAutumnCheckout });

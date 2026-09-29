import { type CreateScheduleBillingContext, formatMs } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { logMultiAttachContext } from "@/internal/billing/v2/actions/multiAttach/logs/logMultiAttachContext";
import { addToExtraLogs } from "@/utils/logging/addToExtraLogs";

export const logSetPlansContext = ({
	ctx,
	billingContext,
}: {
	ctx: AutumnContext;
	billingContext: CreateScheduleBillingContext;
}) => {
	logMultiAttachContext({ ctx, billingContext });

	const { immediatePhase, futurePhases, replacedScheduleCustomerProductIds } =
		billingContext;

	addToExtraLogs({
		ctx,
		extras: {
			setPlansContext: {
				phases: [immediatePhase, ...futurePhases]
					.map(
						(phase) =>
							`${formatMs(phase.starts_at)}: ${phase.plans.map((plan) => plan.plan_id).join(", ")}`,
					)
					.join(" | "),
				replacedScheduleCustomerProducts:
					replacedScheduleCustomerProductIds.length,
				backdatedTo: billingContext.subscriptionBackdateStartMs
					? formatMs(billingContext.subscriptionBackdateStartMs)
					: "none",
			},
		},
	});
};

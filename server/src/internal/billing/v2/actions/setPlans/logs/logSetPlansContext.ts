import { type CreateScheduleBillingContext, formatMs } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { logMultiAttachContext } from "@/internal/billing/v2/actions/multiAttach/logs/logMultiAttachContext";
import { addToExtraLogs } from "@/utils/logging/addToExtraLogs";
import type { SetPlansTimeline } from "../types/setPlansTimeline";

export const logSetPlansContext = ({
	ctx,
	billingContext,
	timeline,
}: {
	ctx: AutumnContext;
	billingContext: CreateScheduleBillingContext;
	timeline: SetPlansTimeline;
}) => {
	logMultiAttachContext({ ctx, billingContext });

	const { immediatePhase, futurePhases } = billingContext;

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
				policies: timeline.policies,
				timelineOperations: timeline.diff.operations
					.filter(({ type }) => type !== "keep")
					.map((operation) => `${operation.type}:${operation.key}`)
					.join(", "),
				backdatedTo: billingContext.subscriptionBackdateStartMs
					? formatMs(billingContext.subscriptionBackdateStartMs)
					: "none",
			},
		},
	});
};

import { formatMs } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { addToExtraLogs } from "@/utils/logging/addToExtraLogs";
import type { CreateCustomerContext } from "../createCustomerContext";
import type { ExecuteAutumnResult } from "../execute/executeAutumnCreateCustomerPlan";

export const logCreateCustomerContext = ({
	ctx,
	context,
}: {
	ctx: AutumnContext;
	context: CreateCustomerContext;
}) => {
	const {
		fullCustomer,
		fullProducts,
		currentEpochMs,
		trialContext,
		hasPaidProducts,
	} = context;

	addToExtraLogs({
		ctx,
		extras: {
			createCustomerContext: {
				customer: `${fullCustomer.id ?? fullCustomer.internal_id} | ${fullCustomer.email ?? "no email"}`,
				products:
					fullProducts.map((p) => `${p.id} (v${p.version})`).join(", ") ||
					"none",
				hasPaidProducts,
				currentEpochMs: formatMs(currentEpochMs),
				trialContext: trialContext
					? `ends at: ${formatMs(trialContext.trialEndsAt)}, free trial: ${trialContext.freeTrial?.id ?? "none"}, card required: ${trialContext.cardRequired}`
					: "none",
			},
		},
	});
};

export const logAutumnPlanResult = ({
	ctx,
	result,
}: {
	ctx: AutumnContext;
	result: ExecuteAutumnResult;
}) => {
	addToExtraLogs({
		ctx,
		extras: {
			autumnPlanResult: result.type,
		},
	});
};
